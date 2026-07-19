import { Component, inject, OnInit, signal } from '@angular/core';
import type { AppTheme, VaultPreferences } from '../../core/models/vault.models';
import { DEFAULT_PREFERENCES } from '../../core/models/vault.models';
import { StorageEngine } from '../../core/storage/storage-engine';
import { ThemeService } from '../../core/services/theme.service';
import { AppIcon } from '../../shared/components/app-icon';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { VaultStore } from '../../core/services/vault.store';

@Component({
  selector: 'app-settings',
  imports: [AppIcon, ConfirmationDialog],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly storage = inject(StorageEngine);
  private readonly vault = inject(VaultStore);
  readonly themeService = inject(ThemeService);
  readonly preferences = signal<VaultPreferences>(DEFAULT_PREFERENCES);
  readonly message = signal('');
  readonly clearDatabaseOpen = signal(false);
  readonly clearingDatabase = signal(false);
  readonly attemptLimitConfirmationOpen = signal(false);
  readonly savingAttemptLimit = signal(false);
  readonly pendingMaxUnlockAttempts = signal<number | null>(null);
  async ngOnInit(): Promise<void> {
    this.preferences.set({
      ...DEFAULT_PREFERENCES,
      ...((await this.storage.getPreferences()) ?? {}),
    });
  }
  async setTheme(theme: AppTheme): Promise<void> {
    await this.themeService.setTheme(theme);
    this.preferences.update((value) => ({ ...value, theme }));
  }
  async toggle<K extends 'lockOnBackground' | 'screenshotProtection'>(key: K): Promise<void> {
    const updated = { ...this.preferences(), [key]: !this.preferences()[key] };
    this.preferences.set(updated);
    await this.storage.savePreferences(updated);
  }
  async setMaxUnlockAttempts(event: Event): Promise<void> {
    const rawValue = (event.target as HTMLSelectElement).value;
    const maxUnlockAttempts = rawValue === 'unlimited' ? null : Number(rawValue);
    if (maxUnlockAttempts !== null) {
      this.pendingMaxUnlockAttempts.set(maxUnlockAttempts);
      this.attemptLimitConfirmationOpen.set(true);
      return;
    }
    await this.saveMaxUnlockAttempts(null);
  }
  cancelAttemptLimitChange(): void {
    this.attemptLimitConfirmationOpen.set(false);
    this.pendingMaxUnlockAttempts.set(null);
    this.preferences.update((current) => ({ ...current }));
  }
  async confirmAttemptLimitChange(): Promise<void> {
    const limit = this.pendingMaxUnlockAttempts();
    if (limit === null) return;
    this.savingAttemptLimit.set(true);
    try {
      await this.saveMaxUnlockAttempts(limit);
      this.attemptLimitConfirmationOpen.set(false);
      this.pendingMaxUnlockAttempts.set(null);
    } catch (error: unknown) {
      this.message.set(
        error instanceof Error ? error.message : 'The failed-attempt limit could not be saved.',
      );
    } finally {
      this.savingAttemptLimit.set(false);
    }
  }
  private async saveMaxUnlockAttempts(maxUnlockAttempts: number | null): Promise<void> {
    const updated = { ...this.preferences(), maxUnlockAttempts };
    await this.storage.saveUnlockSecurityState({ id: 'unlock-security', failedAttempts: 0 });
    await this.storage.savePreferences(updated);
    this.preferences.set(updated);
  }
  async clearClipboard(): Promise<void> {
    await navigator.clipboard.writeText('');
    this.message.set('Clipboard cleared');
    setTimeout(() => this.message.set(''), 1800);
  }
  async clearVaultDatabase(): Promise<void> {
    this.clearingDatabase.set(true);
    try {
      await this.storage.clearVaultData();
      this.vault.clear();
      this.clearDatabaseOpen.set(false);
      this.message.set('All vault items were permanently deleted');
      setTimeout(() => this.message.set(''), 2500);
    } catch (error: unknown) {
      this.message.set(
        error instanceof Error ? error.message : 'The vault database could not be cleared.',
      );
    } finally {
      this.clearingDatabase.set(false);
    }
  }
}
