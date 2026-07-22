import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import type {
  VaultBackupSnapshot,
  VaultItem,
  VaultItemRecord,
  VaultPreferences,
} from '../models/vault.models';
import { StorageEngine } from '../storage/storage-engine';
import { AuthStore } from './auth.store';
import { VaultCryptoService } from '../crypto/vault-crypto.service';

interface CompactVaultBackupSnapshot {
  readonly format: 'vault-nest-compact-snapshot';
  readonly version: 2;
  readonly createdAt: string;
  readonly header: VaultBackupSnapshot['header'];
  readonly preferences: VaultPreferences;
  readonly vaultKey: string;
  readonly items: readonly VaultItem[];
}

interface NativeBackupBridge {
  openBackup(): void;
  saveBackup(fileName: string, base64Data: string): void;
}

interface NativeBackupWindow extends Window {
  VaultNestNative?: NativeBackupBridge;
}

interface EncryptedBackup {
  readonly format: 'vault-nest-encrypted-backup';
  readonly version: 1 | 2;
  readonly createdAt: string;
  readonly compression?: 'gzip';
  readonly kdf: {
    readonly algorithm: 'PBKDF2-SHA256';
    readonly iterations: number;
    readonly salt: string;
  };
  readonly cipher: { readonly algorithm: 'AES-GCM'; readonly iv: string; readonly data: string };
}

const BACKUP_ITERATIONS = 600_000;

@Service()
export class BackupService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StorageEngine);
  private readonly auth = inject(AuthStore);
  private readonly vaultCrypto = inject(VaultCryptoService);
  readonly filePickerActive = signal(false);

  async create(passphrase: string): Promise<{ fileName: string; contents: string }> {
    this.validatePassphrase(passphrase);
    const header = await this.storage.getHeader();
    const preferences = await this.storage.getPreferences();
    if (!header || !preferences) throw new Error('The vault is not ready to back up.');
    const records = await this.storage.listItems();
    const vaultKey = this.auth.getKey();
    const rawVaultKey = await this.vaultCrypto.exportVaultKey(vaultKey);
    const snapshot: CompactVaultBackupSnapshot = {
      format: 'vault-nest-compact-snapshot',
      version: 2,
      createdAt: new Date().toISOString(),
      header,
      preferences: {
        ...preferences,
        easyUnlockMode: 'DISABLED',
        biometricEnabled: false,
        intrusionEvidenceEnabled: false,
      },
      vaultKey: this.toBase64(rawVaultKey),
      items: await Promise.all(
        records.map((record) =>
          this.vaultCrypto.decryptJson<VaultItem>(
            record.encryptedPayload,
            vaultKey,
            `item:${record.id}`,
          ),
        ),
      ),
    };
    rawVaultKey.fill(0);
    const encoded = new TextEncoder().encode(JSON.stringify(snapshot));
    const canCompress = typeof CompressionStream === 'function';
    const payload = canCompress ? await this.compress(encoded) : encoded;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(passphrase, salt, BACKUP_ITERATIONS);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
    const backup: EncryptedBackup = {
      format: 'vault-nest-encrypted-backup',
      version: canCompress ? 2 : 1,
      createdAt: snapshot.createdAt,
      ...(canCompress ? { compression: 'gzip' as const } : {}),
      kdf: {
        algorithm: 'PBKDF2-SHA256',
        iterations: BACKUP_ITERATIONS,
        salt: this.toBase64(salt),
      },
      cipher: {
        algorithm: 'AES-GCM',
        iv: this.toBase64(iv),
        data: this.toBase64(new Uint8Array(encrypted)),
      },
    };
    return {
      fileName: `vault-nest-${new Date().toISOString().slice(0, 10)}.vaultpack`,
      contents: JSON.stringify(backup),
    };
  }

  async save(fileName: string, contents: string): Promise<void> {
    this.filePickerActive.set(true);
    try {
      const nativeBridge = (this.document.defaultView as NativeBackupWindow | null)
        ?.VaultNestNative;
      if (nativeBridge) {
        await this.waitForNativeResult('backup-saved', () =>
          nativeBridge.saveBackup(fileName, this.toBase64(new TextEncoder().encode(contents))),
        );
        return;
      }
      const file = new File([contents], fileName, { type: 'application/octet-stream' });
      const shareNavigator = this.document.defaultView?.navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (shareNavigator?.share && shareNavigator.canShare?.({ files: [file] })) {
        try {
          await shareNavigator.share({ files: [file], title: 'Vault Nest encrypted backup' });
          return;
        } catch {
          // Continue to the browser download fallback when sharing is cancelled or unavailable.
        }
      }
      const url = URL.createObjectURL(file);
      const anchor = this.document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      this.document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } finally {
      this.filePickerActive.set(false);
    }
  }

  async chooseBackup(): Promise<string> {
    this.filePickerActive.set(true);
    try {
      const nativeBridge = (this.document.defaultView as NativeBackupWindow | null)
        ?.VaultNestNative;
      if (nativeBridge) {
        const data = await this.waitForNativeResult('backup-opened', () =>
          nativeBridge.openBackup(),
        );
        return new TextDecoder().decode(this.fromBase64(data));
      }
      return await new Promise<string>((resolve, reject) => {
        const input = this.document.createElement('input');
        input.type = 'file';
        input.accept = '.vaultpack,application/octet-stream,application/json';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) {
            reject(new Error('No backup file was selected.'));
            return;
          }
          void file.text().then(resolve, reject);
        });
        input.addEventListener('cancel', () => reject(new Error('No backup file was selected.')));
        input.click();
      });
    } finally {
      this.filePickerActive.set(false);
    }
  }

  async restore(contents: string, passphrase: string): Promise<void> {
    this.validatePassphrase(passphrase);
    let parsed: Partial<EncryptedBackup>;
    try {
      parsed = JSON.parse(contents) as Partial<EncryptedBackup>;
    } catch {
      throw new Error('This is not a valid Vault Nest backup file.');
    }
    if (
      parsed.format !== 'vault-nest-encrypted-backup' ||
      (parsed.version !== 1 && parsed.version !== 2) ||
      parsed.kdf?.algorithm !== 'PBKDF2-SHA256' ||
      !Number.isInteger(parsed.kdf.iterations) ||
      parsed.kdf.iterations < 100_000 ||
      parsed.kdf.iterations > 2_000_000 ||
      typeof parsed.kdf.salt !== 'string' ||
      parsed.cipher?.algorithm !== 'AES-GCM' ||
      typeof parsed.cipher.iv !== 'string' ||
      typeof parsed.cipher.data !== 'string' ||
      (parsed.version === 2 && parsed.compression !== 'gzip')
    ) {
      throw new Error('This is not a supported Vault Nest backup.');
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const key = await this.deriveKey(
        passphrase,
        this.fromBase64(parsed.kdf.salt),
        parsed.kdf.iterations,
      );
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.fromBase64(parsed.cipher.iv) },
        key,
        this.fromBase64(parsed.cipher.data),
      );
      bytes = new Uint8Array(decrypted);
    } catch (error: unknown) {
      throw new Error('The backup passphrase is incorrect or the file is damaged.', {
        cause: error,
      });
    }
    let snapshot: unknown;
    try {
      const snapshotBytes = parsed.version === 2 ? await this.decompress(bytes) : bytes;
      snapshot = JSON.parse(new TextDecoder().decode(snapshotBytes)) as unknown;
    } catch (error: unknown) {
      throw new Error('The backup was decrypted, but its contents could not be read.', {
        cause: error,
      });
    }
    if (!this.isSnapshot(snapshot) && !this.isCompactSnapshot(snapshot)) {
      throw new Error('The decrypted backup data is invalid.');
    }
    try {
      const restorable = this.isCompactSnapshot(snapshot)
        ? await this.expandCompactSnapshot(snapshot)
        : snapshot;
      await this.storage.replaceFromBackup(restorable);
    } catch (error: unknown) {
      throw new Error('The backup was decrypted, but the database could not be restored.', {
        cause: error,
      });
    }
  }

  private isCompactSnapshot(value: unknown): value is CompactVaultBackupSnapshot {
    if (!this.isObject(value)) return false;
    return (
      value['format'] === 'vault-nest-compact-snapshot' &&
      value['version'] === 2 &&
      typeof value['createdAt'] === 'string' &&
      typeof value['vaultKey'] === 'string' &&
      this.isObject(value['header']) &&
      this.isObject(value['preferences']) &&
      Array.isArray(value['items']) &&
      value['items'].every((item) => this.isVaultItem(item))
    );
  }

  private isVaultItem(value: unknown): value is VaultItem {
    if (!this.isObject(value)) return false;
    return (
      typeof value['id'] === 'string' &&
      ['LOGIN', 'NOTE', 'IDENTITY', 'WIFI', 'CUSTOM'].includes(String(value['type'])) &&
      typeof value['title'] === 'string' &&
      typeof value['favourite'] === 'boolean' &&
      typeof value['archived'] === 'boolean' &&
      typeof value['createdAt'] === 'string' &&
      typeof value['updatedAt'] === 'string' &&
      Array.isArray(value['fields'])
    );
  }

  private async expandCompactSnapshot(
    snapshot: CompactVaultBackupSnapshot,
  ): Promise<VaultBackupSnapshot> {
    const raw = this.fromBase64(snapshot.vaultKey);
    try {
      if (raw.length !== 32) throw new Error('The backup contains an invalid vault key.');
      const key = await this.vaultCrypto.importVaultKey(raw);
      const items = await Promise.all(
        snapshot.items.map(async (item): Promise<VaultItemRecord> => ({
          id: item.id,
          type: item.type,
          favourite: item.favourite,
          archived: item.archived,
          deletedAt: item.deletedAt,
          expiresAt: item.expiresAt,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          encryptedPayload: await this.vaultCrypto.encryptJson(item, key, `item:${item.id}`),
        })),
      );
      return {
        format: 'vault-nest-snapshot',
        version: 1,
        createdAt: snapshot.createdAt,
        header: snapshot.header,
        preferences: snapshot.preferences,
        unlockSecurity: { id: 'unlock-security', failedAttempts: 0 },
        items,
      };
    } finally {
      raw.fill(0);
    }
  }

  private isSnapshot(value: unknown): value is VaultBackupSnapshot {
    if (!this.isObject(value)) return false;
    const snapshot = value as Partial<VaultBackupSnapshot>;
    const header = snapshot.header;
    const preferences = snapshot.preferences;
    const unlockSecurity = snapshot.unlockSecurity;
    return (
      snapshot.format === 'vault-nest-snapshot' &&
      snapshot.version === 1 &&
      this.isObject(header) &&
      header.id === 'primary' &&
      header.formatVersion === 1 &&
      typeof header.salt === 'string' &&
      typeof header.iterations === 'number' &&
      this.isObject(header.wrappedVaultKey) &&
      header.wrappedVaultKey.algorithm === 'AES-GCM' &&
      typeof header.wrappedVaultKey.iv === 'string' &&
      typeof header.wrappedVaultKey.ciphertext === 'string' &&
      this.isObject(preferences) &&
      ['LIGHT', 'DARK', 'AUTOMATIC'].includes(String(preferences.theme)) &&
      typeof preferences.autoLockMinutes === 'number' &&
      typeof preferences.lockOnBackground === 'boolean' &&
      typeof preferences.trashRetentionDays === 'number' &&
      this.isObject(unlockSecurity) &&
      unlockSecurity.id === 'unlock-security' &&
      typeof unlockSecurity.failedAttempts === 'number' &&
      Array.isArray(snapshot.items) &&
      snapshot.items.every(
        (item): item is VaultItemRecord =>
          this.isObject(item) &&
          typeof item['id'] === 'string' &&
          ['LOGIN', 'NOTE', 'IDENTITY', 'WIFI', 'CUSTOM'].includes(String(item['type'])) &&
          typeof item['favourite'] === 'boolean' &&
          typeof item['archived'] === 'boolean' &&
          typeof item['createdAt'] === 'string' &&
          typeof item['updatedAt'] === 'string' &&
          typeof item['encryptedPayload'] === 'string',
      )
    );
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
  }

  private async deriveKey(
    passphrase: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  private async compress(value: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const stream = new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  private async decompress(value: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This device cannot decompress the backup. Update Android WebView.');
    }
    const stream = new Blob([value]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  private waitForNativeResult(action: string, start: () => void): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const handleResult = (event: Event) => {
        const detail = (
          event as CustomEvent<{
            action: string;
            success: boolean;
            data?: string;
            message?: string;
          }>
        ).detail;
        if (detail.action !== action) return;
        this.document.defaultView?.removeEventListener('vault-nest-native-result', handleResult);
        if (detail.success) resolve(detail.data ?? '');
        else reject(new Error(detail.message ?? 'The file operation was cancelled.'));
      };
      this.document.defaultView?.addEventListener('vault-nest-native-result', handleResult);
      start();
    });
  }

  private validatePassphrase(passphrase: string): void {
    if (passphrase.length < 8) throw new Error('Use a backup passphrase of at least 8 characters.');
  }

  private toBase64(value: Uint8Array): string {
    let binary = '';
    for (let offset = 0; offset < value.length; offset += 0x8000) {
      binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  private fromBase64(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }
}
