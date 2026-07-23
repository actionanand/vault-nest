#!/usr/bin/env node

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync, gzipSync } from 'node:zlib';

const SAFE_ITERATIONS = 10_000;
const VAULT_ITERATIONS = 600_000;
const encoder = new TextEncoder();

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage() {
  console.log(`Usage:
  npm run migrate:safeincloud -- --input "/path/to/SafeInCloud.db" [--output "/path/to/import.vaultpack"]

The converter prompts locally for:
  1. the SafeInCloud master password;
  2. a new Vault Nest master password;
  3. a Vault Nest backup passphrase.

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

function readByteArray(buffer, cursor) {
  if (cursor.offset >= buffer.length) throw new Error('The SafeInCloud file is truncated.');
  const length = buffer[cursor.offset];
  cursor.offset += 1;
  const end = cursor.offset + length;
  if (end > buffer.length) throw new Error('The SafeInCloud file is truncated.');
  const value = buffer.subarray(cursor.offset, end);
  cursor.offset = end;
  return value;
}

function decryptCbc(value, key, iv) {
  if (value.length === 0 || value.length % 16 !== 0) {
    throw new Error('The SafeInCloud encrypted block has an invalid length.');
  }
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(value), decipher.final()]);
}

// Format reference: https://github.com/mxschmitt/golang-safe-in-cloud/blob/main/decrypt.go
function decryptSafeInCloud(file, password) {
  const cursor = { offset: 0 };
  if (file.length < 4) throw new Error('This is not a SafeInCloud database.');
  const magic = file.readUInt16LE(cursor.offset);
  cursor.offset += 2;
  const storageVersion = file[cursor.offset];
  cursor.offset += 1;
  if (magic !== 0x0505) throw new Error('This file does not have a supported SafeInCloud header.');

  const salt = readByteArray(file, cursor);
  const outerIv = readByteArray(file, cursor);
  const wrappingKey = pbkdf2Sync(password, salt, SAFE_ITERATIONS, 32, 'sha1');
  readByteArray(file, cursor);
  const encryptedDescriptor = readByteArray(file, cursor);
  const descriptor = decryptCbc(encryptedDescriptor, wrappingKey, outerIv);
  wrappingKey.fill(0);

  const descriptorCursor = { offset: 0 };
  let innerIv;
  let innerKey;
  try {
    innerIv = readByteArray(descriptor, descriptorCursor);
    innerKey = readByteArray(descriptor, descriptorCursor);
    readByteArray(descriptor, descriptorCursor);
  } catch {
    throw new Error('The SafeInCloud master password is incorrect.');
  }
  if (innerIv.length !== 16 || innerKey.length !== 32) {
    throw new Error('The SafeInCloud master password is incorrect.');
  }

  const encryptedXml = file.subarray(cursor.offset);
  let compressed;
  try {
    compressed = decryptCbc(encryptedXml, innerKey, innerIv);
    const xml = inflateSync(compressed).toString('utf8');
    if (!/<database\b/i.test(xml)) throw new Error('Missing database root.');
    return { xml, storageVersion };
  } catch {
    throw new Error('The SafeInCloud master password is incorrect or the database is damaged.');
  } finally {
    innerKey.fill(0);
    descriptor.fill(0);
    compressed?.fill(0);
  }
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attributes(source) {
  const result = {};
  const expression = /([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  for (const match of source.matchAll(expression)) result[match[1]] = decodeXml(match[3]);
  return result;
}

function elements(xml, tag) {
  const result = [];
  const paired = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  for (const match of xml.matchAll(paired)) {
    result.push({ attributes: attributes(match[1]), body: match[2] });
  }
  const selfClosing = new RegExp(`<${tag}\\b([^>]*)\\/\\s*>`, 'gi');
  for (const match of xml.matchAll(selfClosing)) {
    result.push({ attributes: attributes(match[1]), body: '' });
  }
  return result;
}

function booleanValue(value) {
  return ['1', 'true', 'yes'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
}

function normaliseDate(value, fallback) {
  if (!value) return fallback;
  const numeric = Number(value);
  let date;
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1_000;
    date = new Date(milliseconds);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function safeFieldType(field) {
  const type = String(field.type ?? '').toLowerCase();
  const name = String(field.name ?? '').toLowerCase();
  if (['login', 'username', 'user'].includes(type)) return 'USERNAME';
  if (type === 'password') return 'PASSWORD';
  if (['website', 'url'].includes(type)) return 'WEBSITE';
  if (type === 'email') return 'EMAIL';
  if (type === 'phone') return 'PHONE';
  if (['number', 'numeric'].includes(type)) return 'NUMBER';
  if (['date', 'birthday'].includes(type)) return 'DATE';
  if (['expiration', 'expiry'].includes(type)) return 'EXPIRY';
  if (type === 'pin' || /\bpin\b/.test(name)) return 'PIN';
  if (['otp', 'totp', '2fa'].includes(type)) return 'OTP';
  if (['secret', 'hidden'].includes(type)) return 'SECRET';
  if (['notes', 'multiline', 'text_area'].includes(type)) return 'MULTILINE';
  if (type === 'application') return 'APPLICATION';
  return 'TEXT';
}

function sensitiveField(type, name) {
  if (['PASSWORD', 'PIN', 'SECRET', 'OTP', 'HIDDEN'].includes(type)) return true;
  return /(password|passcode|secret|security|recovery|backup code|cvv|cvc|pin)/i.test(name);
}

function vaultItemType(card, fields) {
  const type = String(card.type ?? '').toLowerCase();
  if (type.includes('wifi')) return 'WIFI';
  if (type.includes('note')) return 'NOTE';
  if (/(identity|passport|license|personal)/.test(type)) return 'IDENTITY';
  if (
    type.includes('login') ||
    fields.some((field) => ['USERNAME', 'PASSWORD', 'WEBSITE'].includes(field.type))
  ) {
    return 'LOGIN';
  }
  return 'CUSTOM';
}

function parseSafeInCloud(xml) {
  const now = new Date().toISOString();
  const labelNames = new Map(
    elements(xml, 'label').map((label) => [label.attributes.id, label.attributes.name ?? '']),
  );
  const rootLabelRelations = new Map();
  for (const relation of elements(xml, 'label_id')) {
    const cardId = relation.attributes.card_id ?? relation.attributes.card ?? '';
    const labelId =
      relation.attributes.label_id ?? relation.attributes.id ?? decodeXml(relation.body).trim();
    if (!cardId || !labelId) continue;
    const ids = rootLabelRelations.get(cardId) ?? [];
    ids.push(labelId);
    rootLabelRelations.set(cardId, ids);
  }

  let attachmentCount = 0;
  let skippedDeleted = 0;
  const items = [];
  for (const [index, element] of elements(xml, 'card').entries()) {
    const card = element.attributes;
    if (booleanValue(card.deleted)) {
      skippedDeleted += 1;
      continue;
    }
    const parsedFields = elements(element.body, 'field').map((entry, fieldIndex) => {
      const source = entry.attributes;
      const name = source.name?.trim() || `Field ${fieldIndex + 1}`;
      const type = safeFieldType(source);
      return {
        id: `safe-field-${index + 1}-${fieldIndex + 1}`,
        label: name,
        value: decodeXml(entry.body),
        type,
        sensitive: sensitiveField(type, name),
      };
    });

    const notes = [];
    const backupCodes = [];
    const fields = [];
    notes.push(
      ...elements(element.body, 'notes')
        .map((entry) => decodeXml(entry.body))
        .filter(Boolean),
    );
    for (const field of parsedFields) {
      if (field.type === 'MULTILINE' && /^notes?$/i.test(field.label)) {
        notes.push(field.value);
      } else if (/(backup|recovery)\s*codes?/i.test(field.label)) {
        backupCodes.push(field.value);
      } else {
        fields.push(field);
      }
    }

    for (const [fileIndex, file] of elements(element.body, 'file').entries()) {
      attachmentCount += 1;
      fields.push({
        id: `safe-attachment-${index + 1}-${fileIndex + 1}`,
        label: `Attachment: ${file.attributes.name || `file-${fileIndex + 1}`}`,
        value: decodeXml(file.body),
        type: 'HIDDEN',
        sensitive: true,
      });
    }

    const nestedLabels = elements(element.body, 'label_id').map((entry) =>
      (entry.attributes.label_id ?? entry.attributes.id ?? decodeXml(entry.body)).trim(),
    );
    const attributeLabels = String(card.label_id ?? card.labels ?? '')
      .split(/[,;\s]+/)
      .filter(Boolean);
    const labelIds = [
      ...nestedLabels,
      ...attributeLabels,
      ...(rootLabelRelations.get(card.id) ?? []),
    ];
    const labels = [...new Set(labelIds.map((id) => labelNames.get(id)).filter(Boolean))];
    const updatedAt = normaliseDate(card.time_stamp, now);
    const createdAt = normaliseDate(card.first_stamp, updatedAt);
    const id = `safeincloud-${card.id || index + 1}`;
    items.push({
      id,
      type: vaultItemType(card, fields),
      title: card.title?.trim() || `Imported item ${index + 1}`,
      icon: '',
      fields,
      notes: notes.filter(Boolean).join('\n\n'),
      ...(backupCodes.length ? { backupCodes: backupCodes.join('\n') } : {}),
      labels,
      favourite: booleanValue(card.star),
      archived: false,
      ...(booleanValue(card.template) ? { template: true } : {}),
      createdAt,
      updatedAt,
    });
  }
  return { items, attachmentCount, skippedDeleted, labelCount: labelNames.size };
}

function base64(value) {
  return Buffer.from(value).toString('base64');
}

function encryptGcm(value, key, iv, additionalData) {
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (additionalData) cipher.setAAD(encoder.encode(additionalData));
  return Buffer.concat([cipher.update(value), cipher.final(), cipher.getAuthTag()]);
}

function validateVaultPassword(value) {
  return (
    Array.from(value.normalize('NFKC')).length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9\s]/.test(value)
  );
}

function createVaultPack(items, masterPassword, backupPassphrase) {
  const createdAt = new Date().toISOString();
  const headerSalt = randomBytes(32);
  const vaultKey = randomBytes(32);
  const wrappingKey = pbkdf2Sync(
    masterPassword.normalize('NFKC'),
    headerSalt,
    VAULT_ITERATIONS,
    32,
    'sha256',
  );
  const headerIv = randomBytes(12);
  const wrappedVaultKey = encryptGcm(vaultKey, wrappingKey, headerIv, 'vault-key:v1');
  wrappingKey.fill(0);

  const snapshot = {
    format: 'vault-nest-compact-snapshot',
    version: 2,
    createdAt,
    header: {
      id: 'primary',
      formatVersion: 1,
      salt: base64(headerSalt),
      iterations: VAULT_ITERATIONS,
      wrappedVaultKey: {
        version: 1,
        algorithm: 'AES-GCM',
        iv: base64(headerIv),
        ciphertext: base64(wrappedVaultKey),
      },
      createdAt,
    },
    preferences: {
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
    },
    vaultKey: base64(vaultKey),
    items,
  };
  vaultKey.fill(0);

  const compressed = gzipSync(Buffer.from(JSON.stringify(snapshot)));
  const backupSalt = randomBytes(16);
  const backupIv = randomBytes(12);
  const backupKey = pbkdf2Sync(backupPassphrase, backupSalt, VAULT_ITERATIONS, 32, 'sha256');
  const encrypted = encryptGcm(compressed, backupKey, backupIv);
  backupKey.fill(0);
  compressed.fill(0);

  return JSON.stringify({
    format: 'vault-nest-encrypted-backup',
    version: 2,
    createdAt,
    compression: 'gzip',
    kdf: {
      algorithm: 'PBKDF2-SHA256',
      iterations: VAULT_ITERATIONS,
      salt: base64(backupSalt),
    },
    cipher: {
      algorithm: 'AES-GCM',
      iv: base64(backupIv),
      data: base64(encrypted),
    },
  });
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
  if (!existsSync(input)) throw new Error(`SafeInCloud database not found: ${input}`);
  const defaultName = `${basename(input, extname(input))}-vault-nest.vaultpack`;
  const output = resolve(argument('--output') ?? join(dirname(input), defaultName));
  if (input === output) throw new Error('The output path must differ from the SafeInCloud file.');
  if (existsSync(output)) throw new Error(`Output already exists: ${output}`);

  const safePassword = await secretPrompt('SafeInCloud master password: ');
  const decrypted = decryptSafeInCloud(readFileSync(input), safePassword);
  const parsed = parseSafeInCloud(decrypted.xml);
  if (parsed.items.length === 0) throw new Error('No importable SafeInCloud cards were found.');

  const masterPassword = await secretPrompt('New Vault Nest master password: ');
  if (!validateVaultPassword(masterPassword)) {
    throw new Error(
      'The new master password must have 12+ characters, uppercase, lowercase, number, and symbol.',
    );
  }
  const masterConfirmation = await secretPrompt('Confirm new Vault Nest master password: ');
  if (masterPassword !== masterConfirmation) throw new Error('The master passwords do not match.');

  const backupPassphrase = await secretPrompt('VaultPack backup passphrase (8+ characters): ');
  if (backupPassphrase.length < 8) {
    throw new Error('The VaultPack backup passphrase must contain at least 8 characters.');
  }
  const backupConfirmation = await secretPrompt('Confirm VaultPack backup passphrase: ');
  if (backupPassphrase !== backupConfirmation) {
    throw new Error('The VaultPack backup passphrases do not match.');
  }

  const vaultPack = createVaultPack(parsed.items, masterPassword, backupPassphrase);
  writeFileSync(output, vaultPack, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log(`Created: ${output}`);
  console.log(`Imported cards: ${parsed.items.length}`);
  console.log(`Imported templates: ${parsed.items.filter((item) => item.template).length}`);
  console.log(`Imported labels: ${parsed.labelCount}`);
  console.log(`Preserved embedded attachments as hidden fields: ${parsed.attachmentCount}`);
  console.log(`Skipped SafeInCloud deletion tombstones/cards: ${parsed.skippedDeleted}`);
  console.log(`SafeInCloud storage version: ${decrypted.storageVersion}`);
  console.log('No decrypted XML or plaintext credential file was written.');
  console.log('Restore this file in Vault Nest with the VaultPack backup passphrase.');
  console.log('After restoration, unlock Vault Nest with the new Vault Nest master password.');
}

const launchedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (launchedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'SafeInCloud migration failed.');
    process.exitCode = 1;
  });
}

export { createVaultPack, decryptSafeInCloud, parseSafeInCloud };
