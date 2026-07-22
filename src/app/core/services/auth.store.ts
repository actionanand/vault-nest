import { Service, computed, inject, signal } from '@angular/core';
import type {
  EasyUnlockMode,
  UnlockSecurityState,
  VaultHeader,
  VaultPreferences,
} from '../models/vault.models';
import { DEFAULT_PREFERENCES } from '../models/vault.models';
import { VaultCryptoService } from '../crypto/vault-crypto.service';
import { StorageEngine } from '../storage/storage-engine';
import { BiometricService } from './biometric.service';
import { IntrusionEvidenceService } from './intrusion-evidence.service';

export type AuthStatus = 'STARTING' | 'NEEDS_SETUP' | 'LOCKED' | 'UNLOCKED' | 'ERROR';

@Service()
export class AuthStore {
  private readonly storage = inject(StorageEngine);
  private readonly vaultCrypto = inject(VaultCryptoService);
  private readonly biometrics = inject(BiometricService);
  private readonly intrusionEvidence = inject(IntrusionEvidenceService);
  private initialisePromise: Promise<void> | null = null;
  private header: VaultHeader | null = null;
  private vaultKey: CryptoKey | null = null;
  private lastActivity = Date.now();
  readonly status = signal<AuthStatus>('STARTING');
  readonly error = signal<string | null>(null);
  readonly accountWasDeleted = signal(false);
  readonly remainingAttempts = signal<number | null>(null);
  readonly isUnlocked = computed(() => this.status() === 'UNLOCKED');
  readonly hint = computed(() => this.header?.passwordHint ?? '');
  readonly easyUnlockMode = signal<EasyUnlockMode>('DISABLED');
  readonly biometricEnabled = signal(false);
  readonly biometricAvailable = this.biometrics.available;
  readonly cooldownUntil = signal<number | null>(null);
  readonly easyVerificationRequired = signal(false);
  readonly easyVerificationAttemptsRemaining = signal(3);

  initialise(): Promise<void> {
    this.initialisePromise ??= this.start();
    return this.initialisePromise;
  }

  async setup(
    password: string,
    passwordHint: string,
    preferences: VaultPreferences = DEFAULT_PREFERENCES,
  ): Promise<void> {
    const created = await this.vaultCrypto.createVault(password, passwordHint);
    await this.storage.saveHeader(created.header);
    await this.storage.savePreferences(preferences);
    await this.storage.saveUnlockSecurityState({ id: 'unlock-security', failedAttempts: 0 });
    this.header = created.header;
    this.vaultKey = created.key;
    this.accountWasDeleted.set(false);
    this.remainingAttempts.set(null);
    this.status.set('UNLOCKED');
    this.intrusionEvidence.setVaultUnlocked(true);
    this.touch();
  }

  async unlock(password: string): Promise<boolean> {
    if (!this.header) return false;
    if (!(await this.allowPasswordAttempt())) return false;
    let unlockedKey: CryptoKey;
    try {
      unlockedKey = await this.vaultCrypto.unlock(password, this.header);
    } catch {
      return this.recordFailedUnlock();
    }
    await this.completeUnlock(unlockedKey);
    return true;
  }

  async unlockEasy(code: string): Promise<boolean> {
    if (this.easyVerificationRequired()) {
      this.error.set('Easy login is paused. Use the full master password or Android biometrics.');
      return false;
    }
    if (!(await this.allowPasswordAttempt())) return false;
    const record = await this.storage.getEasyUnlock();
    if (!record) return false;
    if (Array.from(code.normalize('NFKC')).length !== 4) {
      this.error.set('Enter exactly 4 characters for easy login.');
      return false;
    }
    try {
      await this.completeUnlock(await this.vaultCrypto.unlockEasy(code, record));
      return true;
    } catch {
      return this.recordFailedUnlock('easy-login code');
    }
  }

  async enableEasyUnlock(
    masterPassword: string,
    mode: Exclude<EasyUnlockMode, 'DISABLED'>,
  ): Promise<boolean> {
    if (!this.header || !this.vaultKey) return false;
    try {
      await this.vaultCrypto.unlock(masterPassword, this.header);
    } catch {
      this.error.set('The master password is incorrect. Easy login was not enabled.');
      return false;
    }
    const characters = Array.from(masterPassword.normalize('NFKC'));
    const code = (mode === 'FIRST_4' ? characters.slice(0, 4) : characters.slice(-4)).join('');
    await this.storage.saveEasyUnlock(
      await this.vaultCrypto.createEasyUnlock(this.vaultKey, code, mode),
    );
    await this.updateSecurityPreferences({ easyUnlockMode: mode });
    this.easyUnlockMode.set(mode);
    return true;
  }

  async disableEasyUnlock(): Promise<void> {
    await this.storage.deleteEasyUnlock();
    await this.updateSecurityPreferences({ easyUnlockMode: 'DISABLED' });
    this.easyUnlockMode.set('DISABLED');
  }

  async enableBiometric(): Promise<void> {
    if (!this.vaultKey) throw new Error('Unlock the vault before enabling biometrics.');
    const raw = await this.vaultCrypto.exportVaultKey(this.vaultKey);
    try {
      await this.biometrics.enable(raw);
    } finally {
      raw.fill(0);
    }
    await this.updateSecurityPreferences({ biometricEnabled: true });
    this.biometricEnabled.set(true);
  }

  async disableBiometric(): Promise<void> {
    this.biometrics.disable();
    await this.updateSecurityPreferences({ biometricEnabled: false });
    this.biometricEnabled.set(false);
  }

  async unlockWithBiometric(): Promise<boolean> {
    try {
      const raw = await this.biometrics.authenticate();
      try {
        await this.completeUnlock(await this.vaultCrypto.importVaultKey(raw));
      } finally {
        raw.fill(0);
      }
      return true;
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Biometric authentication failed.');
      return false;
    }
  }

  lock(): void {
    this.vaultKey = null;
    this.intrusionEvidence.setVaultUnlocked(false);
    if (this.header) this.status.set('LOCKED');
  }

  async deleteAccount(password: string): Promise<boolean> {
    if (!this.header) return false;
    try {
      await this.vaultCrypto.unlock(password, this.header);
    } catch {
      return false;
    }
    await this.eraseVault();
    return true;
  }
  getKey(): CryptoKey {
    if (!this.vaultKey) throw new Error('The vault is locked.');
    return this.vaultKey;
  }
  touch(): void {
    this.lastActivity = Date.now();
  }
  inactiveForMs(): number {
    return Date.now() - this.lastActivity;
  }

  private async start(): Promise<void> {
    try {
      await this.storage.initialise();
      this.header = await this.storage.getHeader();
      const preferences = {
        ...DEFAULT_PREFERENCES,
        ...((await this.storage.getPreferences()) ?? {}),
      };
      const easyUnlock = await this.storage.getEasyUnlock();
      const security = this.normaliseSecurityState(await this.storage.getUnlockSecurityState());
      this.easyUnlockMode.set(easyUnlock?.mode ?? 'DISABLED');
      this.biometricEnabled.set(preferences.biometricEnabled);
      this.syncSecuritySignals(security);
      this.biometrics.refreshAvailability();
      this.status.set(this.header ? 'LOCKED' : 'NEEDS_SETUP');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Local storage could not be opened.');
      this.status.set('ERROR');
    }
  }

  private async eraseVault(): Promise<void> {
    await this.storage.clearAll();
    this.biometrics.disable();
    this.intrusionEvidence.deleteAll();
    this.intrusionEvidence.setVaultUnlocked(false);
    this.vaultKey = null;
    this.header = null;
    this.remainingAttempts.set(null);
    this.easyUnlockMode.set('DISABLED');
    this.biometricEnabled.set(false);
    this.accountWasDeleted.set(true);
    this.status.set('NEEDS_SETUP');
  }

  private async recordFailedUnlock(credential = 'master password'): Promise<false> {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...((await this.storage.getPreferences()) ?? {}),
    };
    const currentState = this.normaliseSecurityState(await this.storage.getUnlockSecurityState());
    const limit = preferences.maxUnlockAttempts;
    if (limit === null) return this.recordUnlimitedFailure(currentState, credential);

    if (currentState.easyVerificationRequired && credential === 'master password') {
      const remaining = currentState.easyVerificationAttemptsRemaining - 1;
      if (remaining <= 0) {
        await this.eraseVault();
        this.error.set(
          'Three full master-password checks failed. All local vault data was permanently deleted.',
        );
        return false;
      }
      const updated = { ...currentState, easyVerificationAttemptsRemaining: remaining };
      await this.storage.saveUnlockSecurityState(updated);
      this.syncSecuritySignals(updated);
      this.error.set(
        `The master password is incorrect. ${remaining} full-password ${remaining === 1 ? 'attempt' : 'attempts'} remain before permanent deletion.`,
      );
      return false;
    }

    const failedAttempts = currentState.failedAttempts + 1;
    if (failedAttempts === 3) void this.intrusionEvidence.captureIfEnabled();
    if (credential === 'easy-login code' && failedAttempts >= limit) {
      const updated = {
        ...currentState,
        failedAttempts,
        easyVerificationRequired: true,
        easyVerificationAttemptsRemaining: 3,
      };
      await this.storage.saveUnlockSecurityState(updated);
      this.syncSecuritySignals(updated);
      this.error.set(
        'The easy-login limit was reached. Verify with your full master password within 3 attempts, or use Android biometrics.',
      );
      return false;
    }
    if (failedAttempts >= limit) {
      await this.eraseVault();
      this.error.set(
        'The failed-attempt limit was reached. All local vault data has been permanently deleted.',
      );
      return false;
    }
    const updated = { ...currentState, failedAttempts };
    await this.storage.saveUnlockSecurityState(updated);
    const remaining = limit - failedAttempts;
    this.remainingAttempts.set(remaining);
    this.error.set(
      `The ${credential} is incorrect. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining before the vault is permanently deleted.`,
    );
    return false;
  }

  private async recordUnlimitedFailure(
    currentState: Required<UnlockSecurityState>,
    credential: string,
  ): Promise<false> {
    const now = Date.now();
    const lastFailure = currentState.lastFailedAt
      ? new Date(currentState.lastFailedAt).getTime()
      : 0;
    const previousStreak = now - lastFailure >= 60_000 ? 0 : currentState.consecutiveFailures;
    const consecutiveFailures = previousStreak + 1;
    if (consecutiveFailures === 3) void this.intrusionEvidence.captureIfEnabled();
    if (consecutiveFailures < 5) {
      const updated = {
        ...currentState,
        consecutiveFailures,
        lastFailedAt: new Date(now).toISOString(),
        cooldownUntil: '',
      };
      await this.storage.saveUnlockSecurityState(updated);
      this.syncSecuritySignals(updated);
      this.error.set(
        `The ${credential} is incorrect. ${5 - consecutiveFailures} more continuous failures will start a cooldown.`,
      );
      return false;
    }
    const durations = [1, 5, 10, 30, 60, 720] as const;
    const level = Math.min(currentState.cooldownLevel, durations.length - 1);
    const minutes = durations[level];
    const cooldownUntil = new Date(now + minutes * 60_000).toISOString();
    const updated = {
      ...currentState,
      consecutiveFailures: 0,
      lastFailedAt: new Date(now).toISOString(),
      cooldownLevel: Math.min(level + 1, durations.length - 1),
      cooldownUntil,
    };
    await this.storage.saveUnlockSecurityState(updated);
    this.syncSecuritySignals(updated);
    this.error.set(
      `Too many continuous failures. Try again in ${minutes === 60 ? '1 hour' : minutes === 720 ? '12 hours' : `${minutes} minutes`}.`,
    );
    return false;
  }

  private async completeUnlock(key: CryptoKey): Promise<void> {
    await this.storage.saveUnlockSecurityState({ id: 'unlock-security', failedAttempts: 0 });
    this.vaultKey = key;
    this.status.set('UNLOCKED');
    this.intrusionEvidence.setVaultUnlocked(true);
    this.error.set(null);
    this.remainingAttempts.set(null);
    this.cooldownUntil.set(null);
    this.easyVerificationRequired.set(false);
    this.easyVerificationAttemptsRemaining.set(3);
    this.touch();
  }

  private async allowPasswordAttempt(): Promise<boolean> {
    const state = this.normaliseSecurityState(await this.storage.getUnlockSecurityState());
    const until = state.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0;
    if (until > Date.now()) {
      this.syncSecuritySignals(state);
      this.error.set(
        'Password entry is temporarily paused. Wait for the cooldown or use Android biometrics.',
      );
      return false;
    }
    this.cooldownUntil.set(null);
    return true;
  }

  private normaliseSecurityState(state: UnlockSecurityState): Required<UnlockSecurityState> {
    return {
      id: 'unlock-security',
      failedAttempts: state.failedAttempts ?? 0,
      consecutiveFailures: state.consecutiveFailures ?? 0,
      lastFailedAt: state.lastFailedAt ?? '',
      cooldownLevel: state.cooldownLevel ?? 0,
      cooldownUntil: state.cooldownUntil ?? '',
      easyVerificationRequired: state.easyVerificationRequired ?? false,
      easyVerificationAttemptsRemaining: state.easyVerificationAttemptsRemaining ?? 3,
    };
  }

  private syncSecuritySignals(state: UnlockSecurityState): void {
    const until = state.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0;
    this.cooldownUntil.set(until > Date.now() ? until : null);
    this.easyVerificationRequired.set(state.easyVerificationRequired ?? false);
    this.easyVerificationAttemptsRemaining.set(state.easyVerificationAttemptsRemaining ?? 3);
  }

  private async updateSecurityPreferences(
    change: Partial<Pick<VaultPreferences, 'easyUnlockMode' | 'biometricEnabled'>>,
  ): Promise<void> {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...((await this.storage.getPreferences()) ?? {}),
      ...change,
    };
    await this.storage.savePreferences(preferences);
  }
}
