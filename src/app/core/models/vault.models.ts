export type VaultItemType = 'LOGIN' | 'NOTE' | 'IDENTITY' | 'WIFI' | 'CUSTOM';
export type VaultFieldType =
  | 'TEXT'
  | 'MULTILINE'
  | 'NUMBER'
  | 'USERNAME'
  | 'PASSWORD'
  | 'OTP'
  | 'WEBSITE'
  | 'EMAIL'
  | 'PHONE'
  | 'DATE'
  | 'EXPIRY'
  | 'PIN'
  | 'SECRET'
  | 'APPLICATION'
  | 'BOOLEAN'
  | 'DROPDOWN'
  | 'HIDDEN';

export interface VaultField {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly type: VaultFieldType;
  readonly sensitive: boolean;
  readonly expiresAt?: string;
  readonly notes?: string;
}

export interface VaultItem {
  readonly id: string;
  readonly type: VaultItemType;
  readonly title: string;
  readonly icon: string;
  readonly fields: readonly VaultField[];
  readonly notes: string;
  readonly backupCodes?: string;
  readonly labels: readonly string[];
  readonly favourite: boolean;
  readonly archived: boolean;
  readonly template?: boolean;
  readonly deletedAt?: string;
  readonly expiresAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastViewedAt?: string;
}

export interface VaultItemRecord {
  readonly id: string;
  readonly type: VaultItemType;
  readonly favourite: boolean;
  readonly archived: boolean;
  readonly deletedAt?: string;
  readonly expiresAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly encryptedPayload: string;
}

export interface EncryptedEnvelope {
  readonly version: 1;
  readonly algorithm: 'AES-GCM';
  readonly iv: string;
  readonly ciphertext: string;
}

export interface VaultHeader {
  readonly id: 'primary';
  readonly formatVersion: 1;
  readonly salt: string;
  readonly iterations: number;
  readonly wrappedVaultKey: EncryptedEnvelope;
  readonly createdAt: string;
  readonly passwordHint?: string;
}

export type AppTheme = 'LIGHT' | 'DARK' | 'AUTOMATIC';
export type EasyUnlockMode = 'DISABLED' | 'FIRST_4' | 'LAST_4';
export interface VaultPreferences {
  readonly theme: AppTheme;
  readonly autoLockMinutes: number;
  readonly maxUnlockAttempts: number | null;
  readonly lockOnBackground: boolean;
  readonly screenshotProtection: boolean;
  readonly screenshotScope: 'ALL' | 'SENSITIVE';
  readonly historyRetention: number;
  readonly trashRetentionDays: number;
  readonly easyUnlockMode: EasyUnlockMode;
  readonly biometricEnabled: boolean;
  readonly intrusionEvidenceEnabled: boolean;
}

export const DEFAULT_PREFERENCES: VaultPreferences = {
  theme: 'AUTOMATIC',
  autoLockMinutes: 5,
  maxUnlockAttempts: null,
  lockOnBackground: true,
  screenshotProtection: false,
  screenshotScope: 'SENSITIVE',
  historyRetention: 10,
  trashRetentionDays: 30,
  easyUnlockMode: 'DISABLED',
  biometricEnabled: false,
  intrusionEvidenceEnabled: false,
};

export interface EasyUnlockRecord {
  readonly id: 'easy-unlock';
  readonly version: 1;
  readonly mode: Exclude<EasyUnlockMode, 'DISABLED'>;
  readonly salt: string;
  readonly iterations: number;
  readonly wrappedVaultKey: EncryptedEnvelope;
}

export interface UnlockSecurityState {
  readonly id: 'unlock-security';
  readonly failedAttempts: number;
  readonly consecutiveFailures?: number;
  readonly lastFailedAt?: string;
  readonly cooldownLevel?: number;
  readonly cooldownUntil?: string;
  readonly easyVerificationRequired?: boolean;
  readonly easyVerificationAttemptsRemaining?: number;
}

export interface VaultBackupSnapshot {
  readonly format: 'vault-nest-snapshot';
  readonly version: 1;
  readonly createdAt: string;
  readonly header: VaultHeader;
  readonly preferences: VaultPreferences;
  readonly unlockSecurity: UnlockSecurityState;
  readonly items: readonly VaultItemRecord[];
}
