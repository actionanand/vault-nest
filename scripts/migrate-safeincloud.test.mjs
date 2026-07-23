import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import test from 'node:test';
import { deflateSync, gunzipSync } from 'node:zlib';
import { createVaultPack, decryptSafeInCloud, parseSafeInCloud } from './migrate-safeincloud.mjs';

function byteArray(value) {
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

function safeInCloudFixture(xml, password) {
  const salt = randomBytes(16);
  const outerIv = randomBytes(16);
  const innerIv = randomBytes(16);
  const innerKey = randomBytes(32);
  const outerKey = pbkdf2Sync(password, salt, 10_000, 32, 'sha1');
  const descriptor = pad(
    Buffer.concat([byteArray(innerIv), byteArray(innerKey), byteArray(Buffer.alloc(0))]),
  );
  const encryptedDescriptor = encryptCbc(descriptor, outerKey, outerIv);
  const encryptedXml = encryptCbc(pad(deflateSync(Buffer.from(xml))), innerKey, innerIv);
  outerKey.fill(0);
  innerKey.fill(0);
  const magic = Buffer.alloc(2);
  magic.writeUInt16LE(0x0505);
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

function decryptGcm(value, key, iv, additionalData) {
  const tag = value.subarray(value.length - 16);
  const ciphertext = value.subarray(0, value.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  if (additionalData) decipher.setAAD(Buffer.from(additionalData));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

test('converts a SafeInCloud container into a restorable Vault Nest backup', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<database>
  <label id="work" name="Work"/>
  <card id="42" title="Example &amp; account" type="login" star="true">
    <label_id>work</label_id>
    <field name="Login" type="login">person@example.com</field>
    <field name="Password" type="password">secret-value</field>
    <field name="Website" type="website">https://example.com</field>
    <field name="Notes" type="notes">line 1&#10;line 2</field>
    <field name="Recovery codes" type="notes">code-1&#10;code-2</field>
  </card>
</database>`;
  const decrypted = decryptSafeInCloud(
    safeInCloudFixture(xml, 'old-safe-password'),
    'old-safe-password',
  );
  assert.equal(decrypted.xml, xml);

  const parsed = parseSafeInCloud(decrypted.xml);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].title, 'Example & account');
  assert.equal(parsed.items[0].type, 'LOGIN');
  assert.equal(parsed.items[0].favourite, true);
  assert.deepEqual(parsed.items[0].labels, ['Work']);
  assert.equal(parsed.items[0].notes, 'line 1\nline 2');
  assert.equal(parsed.items[0].backupCodes, 'code-1\ncode-2');
  assert.equal(parsed.items[0].fields.find((field) => field.type === 'PASSWORD')?.sensitive, true);

  const vaultPack = JSON.parse(
    createVaultPack(parsed.items, 'NewVault#Password123', 'backup-passphrase'),
  );
  const backupKey = pbkdf2Sync(
    'backup-passphrase',
    Buffer.from(vaultPack.kdf.salt, 'base64'),
    vaultPack.kdf.iterations,
    32,
    'sha256',
  );
  const snapshot = JSON.parse(
    gunzipSync(
      decryptGcm(
        Buffer.from(vaultPack.cipher.data, 'base64'),
        backupKey,
        Buffer.from(vaultPack.cipher.iv, 'base64'),
      ),
    ).toString('utf8'),
  );
  assert.equal(snapshot.format, 'vault-nest-compact-snapshot');
  assert.equal(snapshot.items.length, 1);

  const headerKey = pbkdf2Sync(
    'NewVault#Password123'.normalize('NFKC'),
    Buffer.from(snapshot.header.salt, 'base64'),
    snapshot.header.iterations,
    32,
    'sha256',
  );
  const unwrappedVaultKey = decryptGcm(
    Buffer.from(snapshot.header.wrappedVaultKey.ciphertext, 'base64'),
    headerKey,
    Buffer.from(snapshot.header.wrappedVaultKey.iv, 'base64'),
    'vault-key:v1',
  );
  assert.equal(unwrappedVaultKey.length, 32);
  assert.deepEqual(unwrappedVaultKey, Buffer.from(snapshot.vaultKey, 'base64'));
});
