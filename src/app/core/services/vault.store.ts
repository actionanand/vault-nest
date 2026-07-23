import { Service, computed, inject, signal } from '@angular/core';
import type { VaultItem, VaultItemRecord } from '../models/vault.models';
import { VaultCryptoService } from '../crypto/vault-crypto.service';
import { StorageEngine } from '../storage/storage-engine';
import { AuthStore } from './auth.store';
import { PasswordGeneratorService } from './password-generator.service';

@Service()
export class VaultStore {
  private readonly storage = inject(StorageEngine);
  private readonly crypto = inject(VaultCryptoService);
  private readonly auth = inject(AuthStore);
  private readonly passwordGenerator = inject(PasswordGeneratorService);
  readonly items = signal<readonly VaultItem[]>([]);
  readonly query = signal('');
  readonly typeFilter = signal<VaultItem['type'] | 'ALL'>('ALL');
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(
    () => this.items().find((item) => item.id === this.selectedId()) ?? null,
  );
  readonly activeItems = computed(() =>
    this.items().filter((item) => !item.archived && !item.deletedAt && !item.template),
  );
  readonly archivedItems = computed(() =>
    this.items().filter((item) => item.archived && !item.deletedAt && !item.template),
  );
  readonly trashedItems = computed(() => this.items().filter((item) => Boolean(item.deletedAt)));
  readonly templates = computed(() =>
    this.items().filter((item) => item.template && !item.archived && !item.deletedAt),
  );
  readonly visibleItems = computed(() => this.filterItems(this.activeItems()));
  readonly visibleArchivedItems = computed(() => this.filterItems(this.archivedItems()));
  readonly visibleTrashedItems = computed(() => this.filterItems(this.trashedItems()));
  readonly favouriteItems = computed(() => this.activeItems().filter((item) => item.favourite));
  readonly favourites = computed(() => this.filterItems(this.favouriteItems()));
  readonly weakPasswordItems = computed(() =>
    this.activeItems().filter((item) =>
      item.fields.some(
        (field) =>
          field.type === 'PASSWORD' &&
          field.value.length > 0 &&
          this.passwordGenerator.entropy(field.value) < 50,
      ),
    ),
  );
  readonly visibleWeakPasswordItems = computed(() => this.filterItems(this.weakPasswordItems()));

  private filterItems(items: readonly VaultItem[]): readonly VaultItem[] {
    const query = this.query().trim().toLocaleLowerCase();
    return items.filter(
      (item) =>
        (this.typeFilter() === 'ALL' || item.type === this.typeFilter()) &&
        (!query || this.searchableText(item).includes(query)),
    );
  }

  async load(): Promise<void> {
    const key = this.auth.getKey();
    const preferences = await this.storage.getPreferences();
    let records = await this.storage.listItems();
    const retentionDays = preferences?.trashRetentionDays ?? 30;
    if (retentionDays > 0) {
      const cutoff = Date.now() - retentionDays * 86_400_000;
      const expired = records.filter(
        (record) => record.deletedAt && new Date(record.deletedAt).getTime() <= cutoff,
      );
      await Promise.all(expired.map((record) => this.storage.deleteItem(record.id)));
      const expiredIds = new Set(expired.map((record) => record.id));
      records = records.filter((record) => !expiredIds.has(record.id));
    }
    const items = await Promise.all(
      records.map((record) =>
        this.crypto.decryptJson<VaultItem>(record.encryptedPayload, key, `item:${record.id}`),
      ),
    );
    this.items.set(items);
    if (!this.selectedId()) {
      this.selectedId.set(
        items.find((item) => !item.archived && !item.deletedAt && !item.template)?.id ?? null,
      );
    }
  }

  async save(item: VaultItem, options: { readonly select?: boolean } = {}): Promise<void> {
    const encryptedPayload = await this.crypto.encryptJson(
      item,
      this.auth.getKey(),
      `item:${item.id}`,
    );
    const record: VaultItemRecord = {
      id: item.id,
      type: item.type,
      favourite: item.favourite,
      archived: item.archived,
      deletedAt: item.deletedAt,
      expiresAt: item.expiresAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      encryptedPayload,
    };
    await this.storage.saveItem(record);
    this.items.update((items) =>
      [...items.filter((existing) => existing.id !== item.id), item].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
    if (options.select !== false) this.selectedId.set(item.id);
  }

  async toggleFavourite(item: VaultItem): Promise<void> {
    await this.save({ ...item, favourite: !item.favourite, updatedAt: new Date().toISOString() });
  }
  async deletePermanently(id: string): Promise<void> {
    await this.storage.deleteItem(id);
    this.items.update((items) => items.filter((item) => item.id !== id));
    if (this.selectedId() === id) this.selectedId.set(null);
  }
  async purgeExpiredTrash(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const expired = this.items().filter(
      (item) => item.deletedAt && new Date(item.deletedAt).getTime() <= cutoff,
    );
    await Promise.all(expired.map((item) => this.storage.deleteItem(item.id)));
    const expiredIds = new Set(expired.map((item) => item.id));
    this.items.update((items) => items.filter((item) => !expiredIds.has(item.id)));
    const selectedId = this.selectedId();
    if (selectedId && expiredIds.has(selectedId)) this.selectedId.set(null);
    return expired.length;
  }
  async emptyTrash(): Promise<void> {
    const trashed = this.trashedItems();
    await Promise.all(trashed.map((item) => this.storage.deleteItem(item.id)));
    const ids = new Set(trashed.map((item) => item.id));
    this.items.update((items) => items.filter((item) => !ids.has(item.id)));
    const selectedId = this.selectedId();
    if (selectedId && ids.has(selectedId)) this.selectedId.set(null);
  }
  clear(): void {
    this.items.set([]);
    this.selectedId.set(null);
    this.query.set('');
  }

  private searchableText(item: VaultItem): string {
    return [
      item.title,
      item.type,
      item.notes,
      ...item.labels,
      ...item.fields
        .filter((field) => !field.sensitive)
        .flatMap((field) => [field.label, field.value]),
    ]
      .join(' ')
      .toLocaleLowerCase();
  }
}
