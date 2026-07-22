import type {
  UnlockSecurityState,
  EasyUnlockRecord,
  VaultBackupSnapshot,
  VaultHeader,
  VaultItemRecord,
  VaultPreferences,
} from '../models/vault.models';

export abstract class StorageEngine {
  abstract initialise(): Promise<void>;
  abstract getHeader(): Promise<VaultHeader | null>;
  abstract saveHeader(header: VaultHeader): Promise<void>;
  abstract listItems(): Promise<readonly VaultItemRecord[]>;
  abstract saveItem(item: VaultItemRecord): Promise<void>;
  abstract deleteItem(id: string): Promise<void>;
  abstract getPreferences(): Promise<VaultPreferences | null>;
  abstract savePreferences(preferences: VaultPreferences): Promise<void>;
  abstract getUnlockSecurityState(): Promise<UnlockSecurityState>;
  abstract saveUnlockSecurityState(state: UnlockSecurityState): Promise<void>;
  abstract getEasyUnlock(): Promise<EasyUnlockRecord | null>;
  abstract saveEasyUnlock(record: EasyUnlockRecord): Promise<void>;
  abstract deleteEasyUnlock(): Promise<void>;
  abstract clearVaultData(): Promise<void>;
  abstract replaceFromBackup(snapshot: VaultBackupSnapshot): Promise<void>;
  abstract clearAll(): Promise<void>;
}
