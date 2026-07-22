import { Capacitor } from '@capacitor/core';
import { IndexedDbStorage } from './indexed-db.storage';
import { SqliteStorage } from './sqlite.storage';
import { StorageEngine } from './storage-engine';

export function provideStorageEngine() {
  return {
    provide: StorageEngine,
    useFactory: () =>
      Capacitor.getPlatform() === 'android' ? new SqliteStorage() : new IndexedDbStorage(),
  };
}
