import { Component, inject, OnInit, signal } from '@angular/core';
import type { AppTheme, EasyUnlockMode, VaultPreferences } from '../../core/models/vault.models';
import { DEFAULT_PREFERENCES } from '../../core/models/vault.models';
import { StorageEngine } from '../../core/storage/storage-engine';
import { ThemeService } from '../../core/services/theme.service';
import { AppIcon } from '../../shared/components/app-icon';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';
import { VaultStore } from '../../core/services/vault.store';
import { CredentialNotificationService } from '../../core/services/credential-notification.service';
import { BackupService } from '../../core/services/backup.service';
import { ClipboardService } from '../../core/services/clipboard.service';
import { AuthStore } from '../../core/services/auth.store';
import { IntrusionEvidenceService } from '../../core/services/intrusion-evidence.service';

@Component({
  selector: 'app-settings',
  imports: [AppIcon, ConfirmationDialog],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly storage = inject(StorageEngine);
  private readonly vault = inject(VaultStore);
  private readonly credentialNotifications = inject(CredentialNotificationService);
  private readonly backup = inject(BackupService);
  private readonly clipboard = inject(ClipboardService);
  readonly auth = inject(AuthStore);
  readonly intrusionEvidence = inject(IntrusionEvidenceService);
  readonly themeService = inject(ThemeService);
  readonly preferences = signal<VaultPreferences>(DEFAULT_PREFERENCES);
  readonly message = signal('');
  readonly clearDatabaseOpen = signal(false);
  readonly clearingDatabase = signal(false);
  readonly attemptLimitConfirmationOpen = signal(false);
  readonly savingAttemptLimit = signal(false);
  readonly pendingMaxUnlockAttempts = signal<number | null>(null);
  readonly attemptSelectValue = signal('unlimited');
  readonly retentionDialogOpen = signal(false);
  readonly retentionSelectValue = signal('30');
  readonly backupDialogOpen = signal(false);
  readonly backupAction = signal<'CREATE' | 'RESTORE'>('CREATE');
  readonly backupPassphrase = signal('');
  readonly backupConfirmation = signal('');
  readonly backupContents = signal('');
  readonly backupBusy = signal(false);
  readonly backupError = signal('');
  readonly restoreConfirmationOpen = signal(false);
  readonly easyLoginDialogOpen = signal(false);
  readonly pendingEasyUnlockMode = signal<Exclude<EasyUnlockMode, 'DISABLED'> | null>(null);
  readonly easyLoginPassword = signal('');
  readonly securityBusy = signal(false);
  async ngOnInit(): Promise<void> {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...((await this.storage.getPreferences()) ?? {}),
    };
    this.preferences.set(preferences);
    this.attemptSelectValue.set(preferences.maxUnlockAttempts?.toString() ?? 'unlimited');
    this.retentionSelectValue.set(preferences.trashRetentionDays.toString());
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
    const select = event.target as HTMLSelectElement;
    const rawValue = select.value;
    const maxUnlockAttempts = rawValue === 'unlimited' ? null : Number(rawValue);
    if (maxUnlockAttempts !== null) {
      this.pendingMaxUnlockAttempts.set(maxUnlockAttempts);
      this.attemptLimitConfirmationOpen.set(true);
      this.attemptSelectValue.set(this.preferences().maxUnlockAttempts?.toString() ?? 'unlimited');
      select.value = this.preferences().maxUnlockAttempts?.toString() ?? 'unlimited';
      return;
    }
    await this.saveMaxUnlockAttempts(null);
  }
  cancelAttemptLimitChange(): void {
    this.attemptLimitConfirmationOpen.set(false);
    this.pendingMaxUnlockAttempts.set(null);
    this.attemptSelectValue.set(this.preferences().maxUnlockAttempts?.toString() ?? 'unlimited');
  }
  async confirmAttemptLimitChange(): Promise<void> {
    const limit = this.pendingMaxUnlockAttempts();
    if (limit === null) return;
    this.savingAttemptLimit.set(true);
    try {
      await this.saveMaxUnlockAttempts(limit);
      this.attemptSelectValue.set(limit.toString());
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
    this.attemptSelectValue.set(maxUnlockAttempts?.toString() ?? 'unlimited');
  }
  async clearClipboard(): Promise<void> {
    await this.clipboard.clear();
    this.message.set('Clipboard cleared');
    setTimeout(() => this.message.set(''), 1800);
  }
  async changeEasyLogin(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const mode = select.value as EasyUnlockMode;
    select.value = this.preferences().easyUnlockMode;
    if (mode === 'DISABLED') {
      await this.auth.disableEasyUnlock();
      this.preferences.update((value) => ({ ...value, easyUnlockMode: 'DISABLED' }));
      this.message.set('Easy login disabled');
      return;
    }
    this.pendingEasyUnlockMode.set(mode);
    this.easyLoginPassword.set('');
    this.easyLoginDialogOpen.set(true);
  }
  setEasyLoginPassword(event: Event): void {
    this.easyLoginPassword.set((event.target as HTMLInputElement).value);
  }
  cancelEasyLogin(): void {
    this.easyLoginDialogOpen.set(false);
    this.pendingEasyUnlockMode.set(null);
    this.easyLoginPassword.set('');
  }
  async confirmEasyLogin(): Promise<void> {
    const mode = this.pendingEasyUnlockMode();
    if (!mode || !this.easyLoginPassword()) return;
    this.securityBusy.set(true);
    try {
      if (await this.auth.enableEasyUnlock(this.easyLoginPassword(), mode)) {
        this.preferences.update((value) => ({ ...value, easyUnlockMode: mode }));
        this.cancelEasyLogin();
        this.message.set('Easy login enabled');
      }
    } finally {
      this.securityBusy.set(false);
    }
  }
  async toggleBiometric(): Promise<void> {
    this.securityBusy.set(true);
    try {
      if (this.preferences().biometricEnabled) {
        await this.auth.disableBiometric();
        this.preferences.update((value) => ({ ...value, biometricEnabled: false }));
        this.message.set('Biometric unlock disabled');
      } else {
        await this.auth.enableBiometric();
        this.preferences.update((value) => ({ ...value, biometricEnabled: true }));
        this.message.set('Biometric unlock enabled');
      }
    } catch (error: unknown) {
      this.message.set(
        error instanceof Error ? error.message : 'Biometric settings could not be changed.',
      );
    } finally {
      this.securityBusy.set(false);
    }
  }
  async toggleIntrusionEvidence(): Promise<void> {
    this.securityBusy.set(true);
    try {
      const enabled = !this.preferences().intrusionEvidenceEnabled;
      if (enabled) await this.intrusionEvidence.requestPermission();
      const updated = { ...this.preferences(), intrusionEvidenceEnabled: enabled };
      await this.storage.savePreferences(updated);
      this.preferences.set(updated);
      this.message.set(enabled ? 'Intrusion evidence enabled' : 'Intrusion evidence disabled');
    } catch (error: unknown) {
      this.message.set(
        error instanceof Error ? error.message : 'Camera permission was not granted.',
      );
    } finally {
      this.securityBusy.set(false);
    }
  }
  async openBackup(action: 'CREATE' | 'RESTORE'): Promise<void> {
    this.backupAction.set(action);
    this.backupPassphrase.set('');
    this.backupConfirmation.set('');
    this.backupContents.set('');
    this.backupError.set('');
    if (action === 'RESTORE') {
      try {
        this.backupContents.set(await this.backup.chooseBackup());
      } catch (error: unknown) {
        this.message.set(
          error instanceof Error ? error.message : 'The backup could not be opened.',
        );
        return;
      }
    }
    this.backupDialogOpen.set(true);
  }
  closeBackup(): void {
    this.backupDialogOpen.set(false);
    this.backupPassphrase.set('');
    this.backupConfirmation.set('');
    this.backupContents.set('');
    this.backupError.set('');
  }
  setBackupPassphrase(event: Event): void {
    this.backupPassphrase.set((event.target as HTMLInputElement).value);
  }
  setBackupConfirmation(event: Event): void {
    this.backupConfirmation.set((event.target as HTMLInputElement).value);
  }
  setRetention(event: Event): void {
    this.retentionSelectValue.set((event.target as HTMLSelectElement).value);
  }
  openTrashRetention(): void {
    this.retentionSelectValue.set(this.preferences().trashRetentionDays.toString());
    this.retentionDialogOpen.set(true);
  }
  cancelTrashRetention(): void {
    this.retentionSelectValue.set(this.preferences().trashRetentionDays.toString());
    this.retentionDialogOpen.set(false);
  }
  async submitBackup(): Promise<void> {
    this.backupError.set('');
    if (this.backupPassphrase().length < 8) {
      this.backupError.set('Use a backup passphrase of at least 8 characters.');
      return;
    }
    if (this.backupAction() === 'CREATE' && this.backupPassphrase() !== this.backupConfirmation()) {
      this.backupError.set('The backup passphrases do not match.');
      return;
    }
    if (this.backupAction() === 'RESTORE') {
      this.restoreConfirmationOpen.set(true);
      return;
    }
    this.backupBusy.set(true);
    try {
      const backup = await this.backup.create(this.backupPassphrase());
      await this.backup.save(backup.fileName, backup.contents);
      this.closeBackup();
      this.message.set('Encrypted backup created');
    } catch (error: unknown) {
      this.backupError.set(
        error instanceof Error ? error.message : 'The backup could not be created.',
      );
    } finally {
      this.backupBusy.set(false);
    }
  }
  async confirmRestore(): Promise<void> {
    this.backupBusy.set(true);
    this.backupError.set('');
    try {
      await this.backup.restore(this.backupContents(), this.backupPassphrase());
      await this.auth.disableBiometric();
      await this.credentialNotifications.clearCopyShortcuts();
      this.vault.clear();
      this.restoreConfirmationOpen.set(false);
      this.backupDialogOpen.set(false);
      this.message.set('Backup restored. Vault Nest will reload now.');
      globalThis.setTimeout(() => globalThis.location.reload(), 700);
    } catch (error: unknown) {
      this.restoreConfirmationOpen.set(false);
      this.backupError.set(
        error instanceof Error ? error.message : 'The backup could not be restored.',
      );
    } finally {
      this.backupBusy.set(false);
    }
  }
  async saveTrashRetention(): Promise<void> {
    const trashRetentionDays = Number(this.retentionSelectValue());
    if (![0, 7, 30, 90].includes(trashRetentionDays)) return;
    const updated = { ...this.preferences(), trashRetentionDays };
    await this.storage.savePreferences(updated);
    this.preferences.set(updated);
    const deletedCount = await this.vault.purgeExpiredTrash(trashRetentionDays);
    this.retentionDialogOpen.set(false);
    this.message.set(
      deletedCount
        ? `${deletedCount} expired trash ${deletedCount === 1 ? 'item was' : 'items were'} permanently deleted`
        : 'Trash retention updated',
    );
  }
  async clearVaultDatabase(): Promise<void> {
    this.clearingDatabase.set(true);
    try {
      await this.storage.clearVaultData();
      await this.credentialNotifications.clearCopyShortcuts();
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
