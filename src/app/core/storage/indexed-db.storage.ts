import { Service } from '@angular/core';
import type {
  UnlockSecurityState,
  VaultHeader,
  VaultItemRecord,
  VaultPreferences,
} from '../models/vault.models';
import { StorageEngine } from './storage-engine';

const DATABASE_NAME = 'vault-nest';
const DATABASE_VERSION = 1;

@Service()
export class IndexedDbStorage extends StorageEngine {
  private database: IDBDatabase | null = null;

  initialise(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('metadata'))
          database.createObjectStore('metadata', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('items')) {
          const items = database.createObjectStore('items', { keyPath: 'id' });
          items.createIndex('type', 'type');
          items.createIndex('favourite', 'favourite');
          items.createIndex('updatedAt', 'updatedAt');
          items.createIndex('archived', 'archived');
          items.createIndex('deletedAt', 'deletedAt');
          items.createIndex('expiresAt', 'expiresAt');
        }
      };
      request.onsuccess = () => {
        this.database = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
    });
  }

  getHeader(): Promise<VaultHeader | null> {
    return this.get<VaultHeader>('metadata', 'primary');
  }
  saveHeader(header: VaultHeader): Promise<void> {
    return this.put('metadata', header);
  }
  listItems(): Promise<readonly VaultItemRecord[]> {
    return this.getAll<VaultItemRecord>('items');
  }
  saveItem(item: VaultItemRecord): Promise<void> {
    return this.put('items', item);
  }
  deleteItem(id: string): Promise<void> {
    return this.remove('items', id);
  }
  getPreferences(): Promise<VaultPreferences | null> {
    return this.get<PreferencesRecord>('metadata', 'preferences').then(
      (value) => value?.value ?? null,
    );
  }
  savePreferences(value: VaultPreferences): Promise<void> {
    return this.put('metadata', { id: 'preferences', value });
  }
  async getUnlockSecurityState(): Promise<UnlockSecurityState> {
    return (
      (await this.get<UnlockSecurityState>('metadata', 'unlock-security')) ?? {
        id: 'unlock-security',
        failedAttempts: 0,
      }
    );
  }
  saveUnlockSecurityState(state: UnlockSecurityState): Promise<void> {
    return this.put('metadata', state);
  }
  clearVaultData(): Promise<void> {
    return this.request(this.store('items', 'readwrite').clear()).then(() => undefined);
  }
  clearAll(): Promise<void> {
    if (!this.database) throw new Error('Storage has not been initialised.');
    return new Promise((resolve, reject) => {
      const transaction = this.database!.transaction(['metadata', 'items'], 'readwrite');
      transaction.objectStore('items').clear();
      transaction.objectStore('metadata').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('The local vault could not be cleared.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Clearing the local vault was aborted.'));
    });
  }

  private store(name: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.database) throw new Error('Storage has not been initialised.');
    return this.database.transaction(name, mode).objectStore(name);
  }

  private get<T>(store: string, key: IDBValidKey): Promise<T | null> {
    return this.request<T | undefined>(this.store(store, 'readonly').get(key)).then(
      (value) => value ?? null,
    );
  }
  private getAll<T>(store: string): Promise<readonly T[]> {
    return this.request<T[]>(this.store(store, 'readonly').getAll());
  }
  private put(store: string, value: unknown): Promise<void> {
    return this.request(this.store(store, 'readwrite').put(value)).then(() => undefined);
  }
  private remove(store: string, key: IDBValidKey): Promise<void> {
    return this.request(this.store(store, 'readwrite').delete(key)).then(() => undefined);
  }
  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Local database operation failed.'));
    });
  }
}

interface PreferencesRecord {
  readonly id: 'preferences';
  readonly value: VaultPreferences;
}
