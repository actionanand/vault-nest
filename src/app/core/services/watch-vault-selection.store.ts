import { Service, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DEFAULT_PREFERENCES, type VaultItem, type VaultPreferences } from '../models/vault.models';
import { StorageEngine } from '../storage/storage-engine';

@Service()
export class WatchVaultSelectionStore {
  private readonly storage = inject(StorageEngine);
  readonly maxEntries = environment.watchVaultMaxEntries;
  readonly entryIds = signal<readonly string[]>([]);
  readonly lastSyncedAt = signal<string | null>(null);
  readonly syncedVersions = signal<Readonly<Record<string, string>>>({});
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    const preferences = await this.preferences();
    this.entryIds.set(this.unique(preferences.watchVaultEntryIds).slice(0, this.maxEntries));
    this.lastSyncedAt.set(preferences.watchVaultLastSyncedAt ?? null);
    this.syncedVersions.set(preferences.watchVaultSyncedVersions ?? {});
    this.loaded = true;
  }

  contains(entryId: string): boolean {
    return this.entryIds().includes(entryId);
  }

  async add(entryId: string): Promise<void> {
    await this.load();
    if (this.contains(entryId)) return;
    if (this.entryIds().length >= this.maxEntries) {
      throw new Error(`Watch Vault is full. Remove one password before adding another.`);
    }
    this.entryIds.update((ids) => [...ids, entryId]);
    await this.persist();
  }

  async remove(entryId: string): Promise<void> {
    await this.load();
    if (!this.contains(entryId)) return;
    this.entryIds.update((ids) => ids.filter((id) => id !== entryId));
    await this.persist();
  }

  async clear(): Promise<void> {
    await this.load();
    this.entryIds.set([]);
    this.lastSyncedAt.set(null);
    this.syncedVersions.set({});
    await this.persist();
  }

  async markSyncRequired(): Promise<void> {
    await this.load();
    this.lastSyncedAt.set(null);
    this.syncedVersions.set({});
    await this.persist();
  }

  async reconcile(items: readonly VaultItem[]): Promise<void> {
    await this.load();
    const activeIds = new Set(
      items
        .filter((item) => !item.deletedAt && !item.archived && !item.template)
        .map((item) => item.id),
    );
    const next = this.entryIds().filter((id) => activeIds.has(id));
    if (next.length === this.entryIds().length) return;
    this.entryIds.set(next);
    await this.persist();
  }

  needsSync(items: readonly VaultItem[]): boolean {
    const versions = this.syncedVersions();
    const selected = items.filter((item) => this.contains(item.id));
    return (
      selected.length !== Object.keys(versions).length ||
      selected.some((item) => versions[item.id] !== item.updatedAt)
    );
  }

  async markSynced(items: readonly VaultItem[], syncedAt: string): Promise<void> {
    const versions = Object.fromEntries(
      items.filter((item) => this.contains(item.id)).map((item) => [item.id, item.updatedAt]),
    );
    this.syncedVersions.set(versions);
    this.lastSyncedAt.set(syncedAt);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const preferences = await this.preferences();
    await this.storage.savePreferences({
      ...preferences,
      watchVaultEntryIds: this.entryIds(),
      watchVaultLastSyncedAt: this.lastSyncedAt() ?? undefined,
      watchVaultSyncedVersions: this.syncedVersions(),
    });
  }

  private async preferences(): Promise<VaultPreferences> {
    return { ...DEFAULT_PREFERENCES, ...((await this.storage.getPreferences()) ?? {}) };
  }

  private unique(values: readonly string[] | undefined): readonly string[] {
    return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value))];
  }
}
