import { Service } from '@angular/core';
import { CapacitorSQLite } from '@capacitor-community/sqlite';
import type {
  UnlockSecurityState,
  EasyUnlockRecord,
  VaultBackupSnapshot,
  VaultHeader,
  VaultItemRecord,
  VaultPreferences,
} from '../models/vault.models';
import { StorageEngine } from './storage-engine';

const DATABASE = 'vaultnest';

@Service()
export class SqliteStorage extends StorageEngine {
  async initialise(): Promise<void> {
    try {
      await CapacitorSQLite.createConnection({
        database: DATABASE,
        version: 1,
        encrypted: false,
        mode: 'no-encryption',
        readonly: false,
      });
    } catch (error: unknown) {
      if (!String(error).toLowerCase().includes('already')) throw error;
    }
    await CapacitorSQLite.open({ database: DATABASE, readonly: false });
    await CapacitorSQLite.execute({
      database: DATABASE,
      transaction: true,
      statements: `
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS vault_metadata (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS vault_items (id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, favourite INTEGER NOT NULL, archived INTEGER NOT NULL, deleted_at TEXT, expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, encrypted_payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_items_type ON vault_items(type);
      CREATE INDEX IF NOT EXISTS idx_items_favourite ON vault_items(favourite);
      CREATE INDEX IF NOT EXISTS idx_items_updated ON vault_items(updated_at);
      CREATE INDEX IF NOT EXISTS idx_items_archived ON vault_items(archived);
      CREATE INDEX IF NOT EXISTS idx_items_deleted ON vault_items(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_items_expiry ON vault_items(expires_at);
      PRAGMA user_version = 1;
    `,
    });
  }

  async getHeader(): Promise<VaultHeader | null> {
    return this.metadata<VaultHeader>('primary');
  }
  saveHeader(header: VaultHeader): Promise<void> {
    return this.saveMetadata('primary', header);
  }
  async getPreferences(): Promise<VaultPreferences | null> {
    return this.metadata<VaultPreferences>('preferences');
  }
  savePreferences(value: VaultPreferences): Promise<void> {
    return this.saveMetadata('preferences', value);
  }
  async getUnlockSecurityState(): Promise<UnlockSecurityState> {
    return (
      (await this.metadata<UnlockSecurityState>('unlock-security')) ?? {
        id: 'unlock-security',
        failedAttempts: 0,
      }
    );
  }
  saveUnlockSecurityState(state: UnlockSecurityState): Promise<void> {
    return this.saveMetadata('unlock-security', state);
  }
  getEasyUnlock(): Promise<EasyUnlockRecord | null> {
    return this.metadata<EasyUnlockRecord>('easy-unlock');
  }
  saveEasyUnlock(record: EasyUnlockRecord): Promise<void> {
    return this.saveMetadata('easy-unlock', record);
  }
  async deleteEasyUnlock(): Promise<void> {
    await CapacitorSQLite.run({
      database: DATABASE,
      statement: 'DELETE FROM vault_metadata WHERE id = ?',
      values: ['easy-unlock'],
      transaction: false,
    });
  }
  async clearVaultData(): Promise<void> {
    await CapacitorSQLite.run({
      database: DATABASE,
      statement: 'DELETE FROM vault_items',
      values: [],
      transaction: false,
    });
  }
  async clearAll(): Promise<void> {
    await CapacitorSQLite.execute({
      database: DATABASE,
      transaction: true,
      statements: 'DELETE FROM vault_items; DELETE FROM vault_metadata;',
    });
  }
  async replaceFromBackup(snapshot: VaultBackupSnapshot): Promise<void> {
    const itemStatements = snapshot.items.map((item) => ({
      statement: 'INSERT INTO vault_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      values: [
        item.id,
        item.type,
        item.favourite ? 1 : 0,
        item.archived ? 1 : 0,
        item.deletedAt ?? null,
        item.expiresAt ?? null,
        item.createdAt,
        item.updatedAt,
        item.encryptedPayload,
      ],
    }));
    await CapacitorSQLite.executeSet({
      database: DATABASE,
      transaction: true,
      set: [
        { statement: 'DELETE FROM vault_items', values: [] },
        { statement: 'DELETE FROM vault_metadata', values: [] },
        {
          statement: 'INSERT INTO vault_metadata VALUES (?, ?)',
          values: ['primary', JSON.stringify(snapshot.header)],
        },
        {
          statement: 'INSERT INTO vault_metadata VALUES (?, ?)',
          values: ['preferences', JSON.stringify(snapshot.preferences)],
        },
        {
          statement: 'INSERT INTO vault_metadata VALUES (?, ?)',
          values: ['unlock-security', JSON.stringify(snapshot.unlockSecurity)],
        },
        ...itemStatements,
      ],
    });
  }
  async listItems(): Promise<readonly VaultItemRecord[]> {
    const result = await CapacitorSQLite.query({
      database: DATABASE,
      statement: 'SELECT * FROM vault_items',
      values: [],
    });
    return (result.values ?? []).map((row) => ({
      id: String(row['id']),
      type: String(row['type']) as VaultItemRecord['type'],
      favourite: row['favourite'] === 1,
      archived: row['archived'] === 1,
      deletedAt: this.optional(row['deleted_at']),
      expiresAt: this.optional(row['expires_at']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
      encryptedPayload: String(row['encrypted_payload']),
    }));
  }
  async saveItem(item: VaultItemRecord): Promise<void> {
    await CapacitorSQLite.run({
      database: DATABASE,
      transaction: false,
      statement: `INSERT INTO vault_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type=excluded.type, favourite=excluded.favourite, archived=excluded.archived, deleted_at=excluded.deleted_at, expires_at=excluded.expires_at, updated_at=excluded.updated_at, encrypted_payload=excluded.encrypted_payload`,
      values: [
        item.id,
        item.type,
        item.favourite ? 1 : 0,
        item.archived ? 1 : 0,
        item.deletedAt ?? null,
        item.expiresAt ?? null,
        item.createdAt,
        item.updatedAt,
        item.encryptedPayload,
      ],
    });
  }
  async deleteItem(id: string): Promise<void> {
    await CapacitorSQLite.run({
      database: DATABASE,
      statement: 'DELETE FROM vault_items WHERE id = ?',
      values: [id],
      transaction: false,
    });
  }
  private async metadata<T>(id: string): Promise<T | null> {
    const result = await CapacitorSQLite.query({
      database: DATABASE,
      statement: 'SELECT payload FROM vault_metadata WHERE id = ?',
      values: [id],
    });
    const payload = result.values?.[0]?.['payload'];
    return typeof payload === 'string' ? (JSON.parse(payload) as T) : null;
  }
  private async saveMetadata(id: string, value: unknown): Promise<void> {
    await CapacitorSQLite.run({
      database: DATABASE,
      statement:
        'INSERT INTO vault_metadata VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      values: [id, JSON.stringify(value)],
      transaction: false,
    });
  }
  private optional(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
}
