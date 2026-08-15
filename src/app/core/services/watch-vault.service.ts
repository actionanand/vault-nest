import { Service, computed, inject, signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { VaultItem } from '../models/vault.models';
import { VaultStore } from './vault.store';
import { WatchVaultSelectionStore } from './watch-vault-selection.store';

export interface WatchStatus {
  readonly available: boolean;
  readonly connected: boolean;
  readonly nodeCount: number;
  readonly pairedNodeCount: number;
  readonly lastAcknowledgedAt?: string;
}

interface WatchSyncResult {
  readonly success: boolean;
  readonly count: number;
  readonly nodeCount: number;
}

interface WatchVaultNativePlugin {
  getStatus(): Promise<WatchStatus>;
  sync(options: { readonly entries: readonly WatchTransferEntry[] }): Promise<WatchSyncResult>;
  clear(): Promise<{ readonly success: boolean; readonly nodeCount: number }>;
  reset(): Promise<{ readonly success: boolean }>;
}

interface WatchTransferEntry {
  readonly id: string;
  readonly title: string;
  readonly username: string;
  readonly password: string;
  readonly updatedAt: string;
}

const NativeWatchVault = registerPlugin<WatchVaultNativePlugin>('WatchVault');

@Service()
export class WatchVaultService {
  private readonly vault = inject(VaultStore);
  readonly selections = inject(WatchVaultSelectionStore);
  readonly status = signal<WatchStatus>({
    available: Capacitor.getPlatform() === 'android',
    connected: false,
    nodeCount: 0,
    pairedNodeCount: 0,
  });
  readonly busy = signal(false);
  readonly message = signal('');
  readonly selectedItems = computed(() =>
    this.selections.entryIds().flatMap((id) => {
      const item = this.vault.activeItems().find((candidate) => candidate.id === id);
      return item ? [item] : [];
    }),
  );
  readonly availableItems = computed(() =>
    this.vault
      .activeItems()
      .filter((item) => this.primaryPassword(item) && !this.selections.contains(item.id)),
  );
  readonly syncRequired = computed(() => this.selections.needsSync(this.vault.activeItems()));

  async initialise(): Promise<void> {
    await this.selections.load();
    await this.selections.reconcile(this.vault.items());
    await this.refreshStatus();
  }

  async add(item: VaultItem): Promise<void> {
    if (!this.primaryPassword(item)) throw new Error('This item does not contain a password.');
    await this.selections.add(item.id);
  }

  remove(entryId: string): Promise<void> {
    return this.selections.remove(entryId);
  }

  isSelected(entryId: string): boolean {
    return this.selections.contains(entryId);
  }

  async sync(): Promise<void> {
    if (!this.isAndroid()) {
      this.message.set('Watch synchronization is available in the Android app.');
      return;
    }
    const entries = this.selectedItems().map((item) => this.transferEntry(item));
    if (entries.length > this.selections.maxEntries) throw new Error('Watch Vault limit exceeded.');
    this.busy.set(true);
    this.message.set('');
    try {
      const result = await NativeWatchVault.sync({ entries });
      const syncedAt = new Date().toISOString();
      await this.selections.markSynced(this.selectedItems(), syncedAt);
      this.message.set(`Watch Vault sync sent successfully: ${result.count} passwords.`);
      await this.refreshStatus();
    } catch (error: unknown) {
      this.message.set(error instanceof Error ? error.message : 'Unable to sync Watch Vault.');
    } finally {
      this.busy.set(false);
    }
  }

  async clearWatch(): Promise<void> {
    this.busy.set(true);
    this.message.set('');
    try {
      if (this.isAndroid()) await NativeWatchVault.clear();
      await this.selections.clear();
      this.message.set('Watch Vault was cleared.');
      await this.refreshStatus();
    } catch (error: unknown) {
      this.message.set(error instanceof Error ? error.message : 'Unable to clear Watch Vault.');
    } finally {
      this.busy.set(false);
    }
  }

  async resetPairing(): Promise<void> {
    if (!this.isAndroid()) return;
    await NativeWatchVault.reset();
    await this.selections.markSyncRequired();
    this.message.set(
      'Phone-side watch trust was reset. Reset the watch locally before pairing again.',
    );
    await this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    if (!this.isAndroid()) return;
    try {
      this.status.set(await NativeWatchVault.getStatus());
    } catch {
      this.status.set({ available: true, connected: false, nodeCount: 0, pairedNodeCount: 0 });
    }
  }

  private transferEntry(item: VaultItem): WatchTransferEntry {
    return {
      id: item.id,
      title: item.title,
      username:
        item.fields.find(
          (field) => ['USERNAME', 'EMAIL'].includes(field.type) && field.value.trim(),
        )?.value ?? '',
      password: this.primaryPassword(item),
      updatedAt: item.updatedAt,
    };
  }

  private primaryPassword(item: VaultItem): string {
    return item.fields.find((field) => field.type === 'PASSWORD' && field.value)?.value ?? '';
  }

  private isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }
}
