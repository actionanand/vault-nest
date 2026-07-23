#!/usr/bin/env node

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync, gunzipSync } from 'node:zlib';

const SAFE_ITERATIONS = 10_000;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage() {
  console.log(`Usage:
  npm run migrate:to-safeincloud -- --input "/path/to/backup.vaultpack" [--output "/path/to/VaultNest-SafeInCloud.db"]

The converter prompts locally for:
  1. the VaultPack backup passphrase;
  2. a new SafeInCloud database password.

Passwords are not accepted as command-line options.`);
}

async function secretPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error('Run this command in an interactive terminal so passwords can be hidden.');
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolvePrompt, rejectPrompt) => {
    let value = '';
    const finish = (error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) rejectPrompt(error);
      else resolvePrompt(value);
    };
    const onData = (character) => {
      if (character === '\u0003') {
        finish(new Error('Migration cancelled.'));
        return;
      }
      if (character === '\r' || character === '\n') {
        finish();
        return;
      }
      if (character === '\u007f' || character === '\b') {
        value = Array.from(value).slice(0, -1).join('');
        return;
      }
      if (character >= ' ') value += character;
    };
    process.stdin.on('data', onData);
  });
}

function decodeBase64(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(`The backup contains invalid ${label}.`);
  }
  return Buffer.from(value, 'base64');
}

function decryptGcm(value, key, iv) {
  if (value.length < 17 || iv.length !== 12) {
    throw new Error('The backup contains invalid encrypted data.');
  }
  const tag = value.subarray(value.length - 16);
  const ciphertext = value.subarray(0, value.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVaultItem(value) {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.fields) &&
    typeof value.favourite === 'boolean' &&
    typeof value.archived === 'boolean'
  );
}

function decryptVaultPack(contents, passphrase) {
  let backup;
  try {
    backup = JSON.parse(contents);
  } catch {
    throw new Error('This is not a valid Vault Nest backup file.');
  }
  if (
    !isObject(backup) ||
    backup.format !== 'vault-nest-encrypted-backup' ||
    backup.version !== 2 ||
    backup.compression !== 'gzip' ||
    !isObject(backup.kdf) ||
    backup.kdf.algorithm !== 'PBKDF2-SHA256' ||
    !Number.isInteger(backup.kdf.iterations) ||
    backup.kdf.iterations < 100_000 ||
    backup.kdf.iterations > 2_000_000 ||
    !isObject(backup.cipher) ||
    backup.cipher.algorithm !== 'AES-GCM'
  ) {
    throw new Error(
      'Only current compact Vault Nest backups are supported. Restore and create a fresh backup first.',
    );
  }

  const salt = decodeBase64(backup.kdf.salt, 'KDF salt');
  const iv = decodeBase64(backup.cipher.iv, 'cipher IV');
  const encrypted = decodeBase64(backup.cipher.data, 'ciphertext');
  const key = pbkdf2Sync(passphrase, salt, backup.kdf.iterations, 32, 'sha256');
  let compressed;
  try {
    compressed = decryptGcm(encrypted, key, iv);
  } catch {
    throw new Error('The VaultPack passphrase is incorrect or the backup is damaged.');
  } finally {
    key.fill(0);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(gunzipSync(compressed).toString('utf8'));
  } catch {
    throw new Error('The backup was decrypted, but its contents could not be read.');
  } finally {
    compressed.fill(0);
  }
  if (
    !isObject(snapshot) ||
    snapshot.format !== 'vault-nest-compact-snapshot' ||
    snapshot.version !== 2 ||
    !Array.isArray(snapshot.items) ||
    !snapshot.items.every(isVaultItem)
  ) {
    throw new Error('The decrypted Vault Nest backup has an unsupported structure.');
  }
  return snapshot;
}

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function safeFieldType(field) {
  return (
    {
      USERNAME: 'login',
      PASSWORD: 'password',
      WEBSITE: 'website',
      APPLICATION: 'website',
      EMAIL: 'email',
      PHONE: 'phone',
      NUMBER: 'number',
      DATE: 'date',
      EXPIRY: 'expiration',
      PIN: 'pin',
      OTP: 'password',
      SECRET: 'password',
      HIDDEN: 'password',
      MULTILINE: 'notes',
      BOOLEAN: 'text',
      DROPDOWN: 'text',
      TEXT: 'text',
    }[field.type] ?? 'text'
  );
}

function safeCardType(item) {
  return (
    {
      LOGIN: 'login',
      NOTE: 'note',
      IDENTITY: 'identity',
      WIFI: 'wifi',
      CUSTOM: 'custom',
    }[item.type] ?? 'custom'
  );
}

function safeTimestamp(value) {
  const milliseconds = new Date(value ?? '').getTime();
  return Number.isFinite(milliseconds) ? String(Math.floor(milliseconds / 1_000)) : '';
}

function toSafeInCloudXml(items) {
  const exportable = items.filter((item) => !item.deletedAt);
  const labelNames = new Set(exportable.flatMap((item) => item.labels ?? []));
  if (exportable.some((item) => item.archived)) labelNames.add('Vault Nest Archived');
  const labels = [...labelNames]
    .filter((label) => typeof label === 'string' && label.trim())
    .sort((left, right) => left.localeCompare(right))
    .map((name, index) => ({ id: String(index + 1), name }));
  const labelIds = new Map(labels.map((label) => [label.name, label.id]));

  const cards = exportable.map((item, index) => {
    const relatedLabels = new Set(item.labels ?? []);
    if (item.archived) relatedLabels.add('Vault Nest Archived');
    const attributes = [
      `id="${index + 1}"`,
      `title="${xml(item.title)}"`,
      `type="${safeCardType(item)}"`,
      `star="${item.favourite ? 'true' : 'false'}"`,
      `template="${item.template ? 'true' : 'false'}"`,
      'deleted="false"',
    ];
    const createdAt = safeTimestamp(item.createdAt);
    const updatedAt = safeTimestamp(item.updatedAt);
    if (createdAt) attributes.push(`first_stamp="${createdAt}"`);
    if (updatedAt) attributes.push(`time_stamp="${updatedAt}"`);

    const fields = (item.fields ?? [])
      .filter((field) => typeof field?.label === 'string' && typeof field?.value === 'string')
      .map(
        (field) =>
          `    <field name="${xml(field.label)}" type="${safeFieldType(field)}">${xml(field.value)}</field>`,
      );
    if (item.backupCodes) {
      fields.push(
        `    <field name="2FA backup codes" type="password">${xml(item.backupCodes)}</field>`,
      );
    }
    const relations = [...relatedLabels]
      .map((label) => labelIds.get(label))
      .filter(Boolean)
      .map((id) => `    <label_id>${id}</label_id>`);
    const notes = item.notes ? [`    <notes>${xml(item.notes)}</notes>`] : [];
    return [
      `  <card ${attributes.join(' ')}>`,
      ...relations,
      ...fields,
      ...notes,
      '  </card>',
    ].join('\n');
  });
  const labelXml = labels.map((label) => `  <label id="${label.id}" name="${xml(label.name)}"/>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<database>',
    ...labelXml,
    ...cards,
    '</database>',
  ].join('\n');
}

function byteArray(value) {
  if (value.length > 255) throw new Error('SafeInCloud descriptor value is too long.');
  return Buffer.concat([Buffer.from([value.length]), value]);
}

function pad(value) {
  const size = 16 - (value.length % 16);
  return Buffer.concat([value, Buffer.alloc(size, size)]);
}

function encryptCbc(value, key, iv) {
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(value), cipher.final()]);
}

// Format reference: https://github.com/mxschmitt/golang-safe-in-cloud
function createSafeInCloudDatabase(xmlContents, password) {
  const salt = randomBytes(16);
  const outerIv = randomBytes(16);
  const innerIv = randomBytes(16);
  const innerKey = randomBytes(32);
  const outerKey = pbkdf2Sync(password, salt, SAFE_ITERATIONS, 32, 'sha1');
  const descriptor = pad(
    Buffer.concat([byteArray(innerIv), byteArray(innerKey), byteArray(Buffer.alloc(0))]),
  );
  const encryptedDescriptor = encryptCbc(descriptor, outerKey, outerIv);
  const compressed = deflateSync(Buffer.from(xmlContents, 'utf8'));
  const encryptedXml = encryptCbc(pad(compressed), innerKey, innerIv);
  const magic = Buffer.alloc(2);
  magic.writeUInt16LE(0x0505);
  outerKey.fill(0);
  innerKey.fill(0);
  descriptor.fill(0);
  compressed.fill(0);
  return Buffer.concat([
    magic,
    Buffer.from([1]),
    byteArray(salt),
    byteArray(outerIv),
    byteArray(Buffer.alloc(0)),
    byteArray(encryptedDescriptor),
    encryptedXml,
  ]);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }
  const inputArgument = argument('--input');
  if (!inputArgument) {
    usage();
    process.exitCode = 1;
    return;
  }
  const input = resolve(inputArgument);
  if (!existsSync(input)) throw new Error(`Vault Nest backup not found: ${input}`);
  const defaultName = `${basename(input, extname(input))}-SafeInCloud.db`;
  const output = resolve(argument('--output') ?? join(dirname(input), defaultName));
  if (input === output) throw new Error('The output path must differ from the VaultPack file.');
  if (existsSync(output)) throw new Error(`Output already exists: ${output}`);

  const backupPassphrase = await secretPrompt('VaultPack backup passphrase: ');
  const snapshot = decryptVaultPack(readFileSync(input, 'utf8'), backupPassphrase);
  const safePassword = await secretPrompt('New SafeInCloud database password (8+ characters): ');
  if (Array.from(safePassword).length < 8) {
    throw new Error('The SafeInCloud database password must contain at least 8 characters.');
  }
  const confirmation = await secretPrompt('Confirm new SafeInCloud database password: ');
  if (safePassword !== confirmation) throw new Error('The SafeInCloud passwords do not match.');

  const activeItems = snapshot.items.filter((item) => !item.deletedAt);
  if (activeItems.length === 0) throw new Error('The backup contains no exportable credentials.');
  const safeXml = toSafeInCloudXml(activeItems);
  const database = createSafeInCloudDatabase(safeXml, safePassword);
  writeFileSync(output, database, { mode: 0o600, flag: 'wx' });
  console.log(`Created: ${output}`);
  console.log(`Exported cards: ${activeItems.length}`);
  console.log(`Skipped trashed cards: ${snapshot.items.length - activeItems.length}`);
  console.log('Archived cards were assigned the "Vault Nest Archived" label.');
  console.log('No plaintext XML or credential file was written.');
}

const launchedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (launchedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'SafeInCloud export failed.');
    process.exitCode = 1;
  });
}

export { createSafeInCloudDatabase, decryptVaultPack, toSafeInCloudXml };
