import { Service } from '@angular/core';
import type {
  EasyUnlockRecord,
  EncryptedEnvelope,
  EasyUnlockMode,
  VaultHeader,
} from '../models/vault.models';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_ITERATIONS = 600_000;

@Service()
export class VaultCryptoService {
  async createVault(
    password: string,
    passwordHint?: string,
  ): Promise<{ header: VaultHeader; key: CryptoKey }> {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const wrappingKey = await this.deriveKey(password, salt, DEFAULT_ITERATIONS);
    const rawVaultKey = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey('raw', rawVaultKey, 'AES-GCM', true, [
      'encrypt',
      'decrypt',
    ]);
    const wrappedVaultKey = await this.encryptBytes(rawVaultKey, wrappingKey, 'vault-key:v1');
    rawVaultKey.fill(0);
    return {
      key,
      header: {
        id: 'primary',
        formatVersion: 1,
        salt: this.toBase64(salt),
        iterations: DEFAULT_ITERATIONS,
        wrappedVaultKey,
        createdAt: new Date().toISOString(),
        passwordHint: passwordHint || undefined,
      },
    };
  }

  async unlock(password: string, header: VaultHeader): Promise<CryptoKey> {
    const wrappingKey = await this.deriveKey(
      password,
      this.fromBase64(header.salt),
      header.iterations,
    );
    const raw = await this.decryptBytes(header.wrappedVaultKey, wrappingKey, 'vault-key:v1');
    try {
      return await this.importVaultKey(raw);
    } finally {
      raw.fill(0);
    }
  }

  async exportVaultKey(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await crypto.subtle.exportKey('raw', key));
  }

  importVaultKey(raw: BufferSource): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  }

  async createEasyUnlock(
    key: CryptoKey,
    code: string,
    mode: Exclude<EasyUnlockMode, 'DISABLED'>,
  ): Promise<EasyUnlockRecord> {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const wrappingKey = await this.deriveKey(code, salt, DEFAULT_ITERATIONS);
    const raw = await this.exportVaultKey(key);
    try {
      return {
        id: 'easy-unlock',
        version: 1,
        mode,
        salt: this.toBase64(salt),
        iterations: DEFAULT_ITERATIONS,
        wrappedVaultKey: await this.encryptBytes(raw, wrappingKey, 'easy-unlock:v1'),
      };
    } finally {
      raw.fill(0);
    }
  }

  async unlockEasy(code: string, record: EasyUnlockRecord): Promise<CryptoKey> {
    const wrappingKey = await this.deriveKey(code, this.fromBase64(record.salt), record.iterations);
    const raw = await this.decryptBytes(record.wrappedVaultKey, wrappingKey, 'easy-unlock:v1');
    try {
      return await this.importVaultKey(raw);
    } finally {
      raw.fill(0);
    }
  }

  async encryptJson(value: unknown, key: CryptoKey, context: string): Promise<string> {
    const envelope = await this.encryptBytes(encoder.encode(JSON.stringify(value)), key, context);
    return JSON.stringify(envelope);
  }

  async decryptJson<T>(value: string, key: CryptoKey, context: string): Promise<T> {
    const envelope = JSON.parse(value) as EncryptedEnvelope;
    const plaintext = await this.decryptBytes(envelope, key, context);
    try {
      return JSON.parse(decoder.decode(plaintext)) as T;
    } finally {
      plaintext.fill(0);
    }
  }

  private async deriveKey(
    password: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password.normalize('NFKC')),
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

  private async encryptBytes(
    value: BufferSource,
    key: CryptoKey,
    context: string,
  ): Promise<EncryptedEnvelope> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(context), tagLength: 128 },
      key,
      value,
    );
    return {
      version: 1,
      algorithm: 'AES-GCM',
      iv: this.toBase64(iv),
      ciphertext: this.toBase64(new Uint8Array(ciphertext)),
    };
  }

  private async decryptBytes(
    envelope: EncryptedEnvelope,
    key: CryptoKey,
    context: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (envelope.version !== 1 || envelope.algorithm !== 'AES-GCM')
      throw new Error('Unsupported encrypted data format.');
    const result = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: this.fromBase64(envelope.iv),
        additionalData: encoder.encode(context),
        tagLength: 128,
      },
      key,
      this.fromBase64(envelope.ciphertext),
    );
    return new Uint8Array(result);
  }

  private toBase64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  private fromBase64(value: string): Uint8Array<ArrayBuffer> {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
}
