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
  readonly labels: readonly string[];
  readonly favourite: boolean;
  readonly archived: boolean;
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
export interface VaultPreferences {
  readonly theme: AppTheme;
  readonly autoLockMinutes: number;
  readonly maxUnlockAttempts: number | null;
  readonly lockOnBackground: boolean;
  readonly screenshotProtection: boolean;
  readonly screenshotScope: 'ALL' | 'SENSITIVE';
  readonly historyRetention: number;
  readonly trashRetentionDays: number;
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
};

export interface UnlockSecurityState {
  readonly id: 'unlock-security';
  readonly failedAttempts: number;
}
