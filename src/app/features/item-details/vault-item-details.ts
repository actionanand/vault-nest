import { Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { VaultItem } from '../../core/models/vault.models';
import { CredentialNotificationService } from '../../core/services/credential-notification.service';
import { VaultStore } from '../../core/services/vault.store';
import { AppIcon } from '../../shared/components/app-icon';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { SecretField } from '../../shared/components/secret-field';
import { ClipboardService } from '../../core/services/clipboard.service';

@Component({
  selector: 'app-vault-item-details',
  imports: [ReactiveFormsModule, RouterLink, AppIcon, ConfirmationDialog, SecretField],
  templateUrl: './vault-item-details.html',
  styleUrl: './vault-item-details.scss',
  host: { '(document:keydown.escape)': 'closeOverlays()' },
})
export class VaultItemDetails {
  private readonly vault = inject(VaultStore);
  private readonly router = inject(Router);
  private readonly clipboard = inject(ClipboardService);
  readonly notifications = inject(CredentialNotificationService);
  readonly item = input.required<VaultItem>();
  readonly menuOpen = signal(false);
  readonly labelDialogOpen = signal(false);
  readonly deleteDialogOpen = signal(false);
  readonly archiveDialogOpen = signal(false);
  readonly unarchiveDialogOpen = signal(false);
  readonly shareDialogOpen = signal(false);
  readonly shareSensitive = signal(false);
  readonly message = signal('');
  readonly labelControl = new FormControl('', { nonNullable: true });
  readonly availableLabels = computed(() =>
    [...new Set(this.vault.items().flatMap((item) => item.labels))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  iconName(item: VaultItem): string {
    return (
      { LOGIN: 'key', NOTE: 'note', IDENTITY: 'identity', WIFI: 'wifi', CUSTOM: 'custom' } as const
    )[item.type];
  }

  openLabels(): void {
    this.menuOpen.set(false);
    this.labelControl.setValue(this.item().labels.join(', '));
    this.labelDialogOpen.set(true);
  }

  labelSelected(label: string): boolean {
    return this.labelsFromControl().includes(label);
  }

  toggleLabel(label: string): void {
    const labels = this.labelsFromControl();
    this.labelControl.setValue(
      (labels.includes(label)
        ? labels.filter((value) => value !== label)
        : [...labels, label]
      ).join(', '),
    );
  }

  async saveLabels(): Promise<void> {
    await this.vault.save({
      ...this.item(),
      labels: this.labelsFromControl(),
      updatedAt: new Date().toISOString(),
    });
    this.labelDialogOpen.set(false);
    this.showMessage('Labels updated');
  }

  async toggleFavourite(): Promise<void> {
    await this.vault.toggleFavourite(this.item());
  }

  async sendNotifications(): Promise<void> {
    await this.notifications.sendCopyShortcuts(this.item());
  }

  async duplicate(): Promise<void> {
    this.menuOpen.set(false);
    const now = new Date().toISOString();
    const duplicate: VaultItem = {
      ...this.item(),
      id: crypto.randomUUID(),
      title: `${this.item().title} copy`,
      favourite: false,
      archived: false,
      template: false,
      deletedAt: undefined,
      createdAt: now,
      updatedAt: now,
      lastViewedAt: undefined,
      fields: this.item().fields.map((field) => ({ ...field, id: crypto.randomUUID() })),
    };
    await this.vault.save(duplicate);
    await this.router.navigate(['/vault/item', duplicate.id]);
  }

  async saveAsTemplate(): Promise<void> {
    this.menuOpen.set(false);
    const sourceId = this.item().id;
    const now = new Date().toISOString();
    const template: VaultItem = {
      ...this.item(),
      id: crypto.randomUUID(),
      title: `${this.item().title} template`,
      favourite: false,
      archived: false,
      template: true,
      deletedAt: undefined,
      expiresAt: undefined,
      createdAt: now,
      updatedAt: now,
      lastViewedAt: undefined,
      fields: this.item().fields.map((field) => ({
        ...field,
        id: crypto.randomUUID(),
        value: '',
        expiresAt: undefined,
      })),
    };
    await this.vault.save(template);
    this.vault.selectedId.set(sourceId);
    this.showMessage('A reusable blank template was saved');
  }

  openArchiveConfirmation(): void {
    this.menuOpen.set(false);
    this.archiveDialogOpen.set(true);
  }

  async archive(): Promise<void> {
    await this.vault.save({
      ...this.item(),
      archived: true,
      updatedAt: new Date().toISOString(),
    });
    this.vault.selectedId.set(null);
    this.archiveDialogOpen.set(false);
    await this.router.navigateByUrl('/vault/all');
  }

  async restoreFromArchive(): Promise<void> {
    await this.vault.save({
      ...this.item(),
      archived: false,
      updatedAt: new Date().toISOString(),
    });
    this.unarchiveDialogOpen.set(false);
    await this.router.navigate(['/vault/item', this.item().id]);
  }

  openUnarchiveConfirmation(): void {
    this.menuOpen.set(false);
    this.unarchiveDialogOpen.set(true);
  }

  async restoreFromTrash(): Promise<void> {
    await this.vault.save({
      ...this.item(),
      archived: false,
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    });
    await this.router.navigate(['/vault/item', this.item().id]);
  }

  async moveToTrash(): Promise<void> {
    await this.vault.save({
      ...this.item(),
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.vault.selectedId.set(null);
    this.deleteDialogOpen.set(false);
    await this.router.navigateByUrl('/vault/all');
  }

  async deletePermanently(): Promise<void> {
    await this.vault.deletePermanently(this.item().id);
    this.deleteDialogOpen.set(false);
    await this.router.navigateByUrl('/vault/trash');
  }

  openShare(): void {
    this.menuOpen.set(false);
    this.shareSensitive.set(false);
    this.shareDialogOpen.set(true);
  }

  async copyShareDetails(): Promise<void> {
    await this.clipboard.copy(this.shareText(), 'Item details');
    this.shareDialogOpen.set(false);
    this.showMessage(
      this.shareSensitive() ? 'All item details copied' : 'Non-sensitive item details copied',
    );
  }

  async shareDetails(): Promise<void> {
    const text = this.shareText();
    if (!navigator.share) {
      await this.clipboard.copy(text, 'Item details');
      this.shareDialogOpen.set(false);
      this.showMessage('Sharing is unavailable, so the details were copied');
      return;
    }
    try {
      await navigator.share({ title: this.item().title, text });
      this.shareDialogOpen.set(false);
    } catch {
      // Keep the dialog open after cancellation so the user can choose Copy instead.
    }
  }

  private shareText(): string {
    const includeSensitive = this.shareSensitive();
    const fields = this.item().fields.filter(
      (field) =>
        field.value.trim() &&
        (includeSensitive || (!field.sensitive && !this.isSensitiveType(field.type))),
    );
    const text = [
      this.item().title,
      `Type: ${this.item().type}`,
      ...fields.map((field) => `${field.label}: ${field.value}`),
      ...(this.item().labels.length ? [`Labels: ${this.item().labels.join(', ')}`] : []),
      ...(includeSensitive && this.item().notes ? [`Notes: ${this.item().notes}`] : []),
      ...(!includeSensitive ? ['Sensitive values were omitted by Vault Nest.'] : []),
    ].join('\n');
    return text;
  }

  private isSensitiveType(type: string): boolean {
    return ['PASSWORD', 'PIN', 'SECRET', 'OTP', 'HIDDEN'].includes(type);
  }

  closeOverlays(): void {
    this.menuOpen.set(false);
    this.labelDialogOpen.set(false);
    this.deleteDialogOpen.set(false);
    this.archiveDialogOpen.set(false);
    this.unarchiveDialogOpen.set(false);
    this.shareDialogOpen.set(false);
  }

  private labelsFromControl(): readonly string[] {
    return [
      ...new Set(
        this.labelControl.value
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean),
      ),
    ];
  }

  private showMessage(message: string): void {
    this.message.set(message);
    setTimeout(() => this.message.set(''), 2200);
  }
}
