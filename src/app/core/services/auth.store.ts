import { Service, computed, inject, signal } from '@angular/core';
import type { VaultHeader, VaultPreferences } from '../models/vault.models';
import { DEFAULT_PREFERENCES } from '../models/vault.models';
import { VaultCryptoService } from '../crypto/vault-crypto.service';
import { StorageEngine } from '../storage/storage-engine';

export type AuthStatus = 'STARTING' | 'NEEDS_SETUP' | 'LOCKED' | 'UNLOCKED' | 'ERROR';

@Service()
export class AuthStore {
  private readonly storage = inject(StorageEngine);
  private readonly vaultCrypto = inject(VaultCryptoService);
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
    this.touch();
  }

  async unlock(password: string): Promise<boolean> {
    if (!this.header) return false;
    let unlockedKey: CryptoKey;
    try {
      unlockedKey = await this.vaultCrypto.unlock(password, this.header);
    } catch {
      return this.recordFailedUnlock();
    }
    await this.storage.saveUnlockSecurityState({ id: 'unlock-security', failedAttempts: 0 });
    this.vaultKey = unlockedKey;
    this.status.set('UNLOCKED');
    this.error.set(null);
    this.remainingAttempts.set(null);
    this.touch();
    return true;
  }

  lock(): void {
    this.vaultKey = null;
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
      this.status.set(this.header ? 'LOCKED' : 'NEEDS_SETUP');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'Local storage could not be opened.');
      this.status.set('ERROR');
    }
  }

  private async eraseVault(): Promise<void> {
    await this.storage.clearAll();
    this.vaultKey = null;
    this.header = null;
    this.remainingAttempts.set(null);
    this.accountWasDeleted.set(true);
    this.status.set('NEEDS_SETUP');
  }

  private async recordFailedUnlock(): Promise<false> {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...((await this.storage.getPreferences()) ?? {}),
    };
    const currentState = await this.storage.getUnlockSecurityState();
    const failedAttempts = currentState.failedAttempts + 1;
    const limit = preferences.maxUnlockAttempts;
    if (limit !== null && failedAttempts >= limit) {
      await this.eraseVault();
      this.error.set(
        'The failed-attempt limit was reached. All local vault data has been permanently deleted.',
      );
      return false;
    }
    await this.storage.saveUnlockSecurityState({ id: 'unlock-security', failedAttempts });
    const remaining = limit === null ? null : limit - failedAttempts;
    this.remainingAttempts.set(remaining);
    this.error.set(
      remaining === null
        ? 'The master password is incorrect.'
        : `The master password is incorrect. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining before the vault is permanently deleted.`,
    );
    return false;
  }
}
