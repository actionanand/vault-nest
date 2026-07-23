import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { VaultStore } from '../../core/services/vault.store';
import { AppIcon } from '../../shared/components/app-icon';
import { VaultItemCard } from '../../shared/components/vault-item-card';
import { VaultItemDetails } from '../item-details/vault-item-details';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { CredentialNotificationService } from '../../core/services/credential-notification.service';

@Component({
  selector: 'app-vault-home',
  imports: [RouterLink, AppIcon, VaultItemCard, VaultItemDetails, ConfirmationDialog],
  templateUrl: './vault-home.html',
  styleUrl: './vault-home.scss',
})
export class VaultHome {
  readonly vault = inject(VaultStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly notifications = inject(CredentialNotificationService);
  readonly addOpen = signal(false);
  readonly filterOpen = signal(false);
  readonly sortOrder = signal<'UPDATED_DESC' | 'TITLE_ASC' | 'TITLE_DESC'>('UPDATED_DESC');
  readonly cleanTrashOpen = signal(false);
  readonly cleaningTrash = signal(false);
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly batchDeleteOpen = signal(false);
  readonly batchBusy = signal(false);
  readonly batchMessage = signal('');
  readonly selectionMode = computed(() => this.selectedIds().size > 0);
  readonly selectedItems = computed(() => {
    const selected = this.selectedIds();
    return this.vault.items().filter((item) => selected.has(item.id));
  });
  readonly favouritesOnly = this.route.snapshot.data['favourites'] === true;
  readonly weakPasswordsOnly = this.route.snapshot.data['weakPasswords'] === true;
  readonly scope = this.route.snapshot.data['scope'] as 'ARCHIVE' | 'TRASH' | undefined;
  readonly title =
    this.scope === 'ARCHIVE'
      ? 'Archive'
      : this.scope === 'TRASH'
        ? 'Trash'
        : this.favouritesOnly
          ? 'Favourites'
          : this.weakPasswordsOnly
            ? 'Weak passwords'
            : 'All items';
  readonly items = computed(() => {
    const items =
      this.scope === 'ARCHIVE'
        ? this.vault.visibleArchivedItems()
        : this.scope === 'TRASH'
          ? this.vault.visibleTrashedItems()
          : this.favouritesOnly
            ? this.vault.favourites()
            : this.weakPasswordsOnly
              ? this.vault.visibleWeakPasswordItems()
              : this.vault.visibleItems();
    return [...items].sort((first, second) => {
      if (this.sortOrder() === 'TITLE_ASC') return first.title.localeCompare(second.title);
      if (this.sortOrder() === 'TITLE_DESC') return second.title.localeCompare(first.title);
      return second.updatedAt.localeCompare(first.updatedAt);
    });
  });
  readonly selectedItem = computed(
    () =>
      this.items().find((item) => item.id === this.vault.selectedId()) ?? this.items()[0] ?? null,
  );
  constructor() {
    const type = this.route.snapshot.queryParamMap.get('type');
    this.vault.typeFilter.set(this.isType(type) ? type : 'ALL');
  }
  emptyTitle(): string {
    if (this.vault.query()) return 'Nothing matched';
    if (this.scope === 'ARCHIVE') return 'No archived items';
    if (this.scope === 'TRASH') return 'Trash is empty';
    if (this.favouritesOnly) return 'No favourites yet';
    if (this.weakPasswordsOnly) return 'No weak passwords';
    return 'Your vault is ready';
  }
  emptyDescription(): string {
    if (this.vault.query()) return 'Try a different title, label, or item type.';
    if (this.scope === 'ARCHIVE') return 'Archived items remain encrypted and appear here.';
    if (this.scope === 'TRASH')
      return 'Deleted items remain here until their retention period expires.';
    if (this.weakPasswordsOnly)
      return 'Passwords estimated below 50 bits of entropy will appear here.';
    return 'Add your first encrypted item to get started.';
  }
  setQuery(event: Event): void {
    this.vault.query.set((event.target as HTMLInputElement).value);
  }
  setSortOrder(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (['UPDATED_DESC', 'TITLE_ASC', 'TITLE_DESC'].includes(value)) {
      this.sortOrder.set(value as 'UPDATED_DESC' | 'TITLE_ASC' | 'TITLE_DESC');
    }
  }
  async cleanTrash(): Promise<void> {
    this.cleaningTrash.set(true);
    try {
      await this.vault.emptyTrash();
      await this.notifications.clearCopyShortcuts();
      this.cleanTrashOpen.set(false);
    } finally {
      this.cleaningTrash.set(false);
    }
  }
  async chooseItem(id: string): Promise<void> {
    this.vault.selectedId.set(id);
    if (this.document.defaultView?.matchMedia('(max-width: 780px)').matches) {
      await this.router.navigate(['/vault/item', id]);
    }
  }
  toggleSelection(id: string): void {
    this.selectedIds.update((selected) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  clearSelection(): void {
    this.selectedIds.set(new Set());
  }
  async addSelectionToFavourites(): Promise<void> {
    if (this.batchBusy()) return;
    this.batchBusy.set(true);
    try {
      const items = this.selectedItems();
      for (const item of items) {
        if (item.favourite) continue;
        await this.vault.save(
          { ...item, favourite: true, updatedAt: new Date().toISOString() },
          { select: false },
        );
      }
      this.clearSelection();
      this.showBatchMessage(
        `${items.length} ${items.length === 1 ? 'item' : 'items'} added to favourites.`,
      );
    } finally {
      this.batchBusy.set(false);
    }
  }
  async deleteSelection(): Promise<void> {
    if (this.batchBusy()) return;
    this.batchBusy.set(true);
    try {
      const items = this.selectedItems();
      if (this.scope === 'TRASH') {
        for (const item of items) await this.vault.deletePermanently(item.id);
      } else {
        for (const item of items) {
          await this.vault.save(
            { ...item, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { select: false },
          );
        }
      }
      await this.notifications.clearCopyShortcuts();
      this.batchDeleteOpen.set(false);
      this.clearSelection();
      this.showBatchMessage(
        `${items.length} ${items.length === 1 ? 'item' : 'items'} ${
          this.scope === 'TRASH' ? 'deleted permanently' : 'moved to Trash'
        }.`,
      );
    } finally {
      this.batchBusy.set(false);
    }
  }
  private showBatchMessage(message: string): void {
    this.batchMessage.set(message);
    setTimeout(() => {
      if (this.batchMessage() === message) this.batchMessage.set('');
    }, 2400);
  }
  private isType(value: string | null): value is 'LOGIN' | 'NOTE' | 'IDENTITY' | 'WIFI' | 'CUSTOM' {
    return value !== null && ['LOGIN', 'NOTE', 'IDENTITY', 'WIFI', 'CUSTOM'].includes(value);
  }
}
