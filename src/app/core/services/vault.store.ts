import { Service, computed, inject, signal } from '@angular/core';
import type { VaultItem, VaultItemRecord } from '../models/vault.models';
import { VaultCryptoService } from '../crypto/vault-crypto.service';
import { StorageEngine } from '../storage/storage-engine';
import { AuthStore } from './auth.store';

@Service()
export class VaultStore {
  private readonly storage = inject(StorageEngine);
  private readonly crypto = inject(VaultCryptoService);
  private readonly auth = inject(AuthStore);
  readonly items = signal<readonly VaultItem[]>([]);
  readonly query = signal('');
  readonly typeFilter = signal<VaultItem['type'] | 'ALL'>('ALL');
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(
    () => this.items().find((item) => item.id === this.selectedId()) ?? null,
  );
  readonly visibleItems = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.items().filter(
      (item) =>
        !item.archived &&
        !item.deletedAt &&
        (this.typeFilter() === 'ALL' || item.type === this.typeFilter()) &&
        (!query || this.searchableText(item).includes(query)),
    );
  });
  readonly favourites = computed(() => this.visibleItems().filter((item) => item.favourite));

  async load(): Promise<void> {
    const key = this.auth.getKey();
    const records = await this.storage.listItems();
    const items = await Promise.all(
      records.map((record) =>
        this.crypto.decryptJson<VaultItem>(record.encryptedPayload, key, `item:${record.id}`),
      ),
    );
    this.items.set(items);
    if (!this.selectedId() && items[0]) this.selectedId.set(items[0].id);
  }

  async save(item: VaultItem): Promise<void> {
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
    this.selectedId.set(item.id);
  }

  async toggleFavourite(item: VaultItem): Promise<void> {
    await this.save({ ...item, favourite: !item.favourite, updatedAt: new Date().toISOString() });
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
