import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSafeInCloudDatabase,
  decryptVaultPack,
  toSafeInCloudXml,
} from './export-safeincloud.mjs';
import { createVaultPack, decryptSafeInCloud, parseSafeInCloud } from './migrate-safeincloud.mjs';

const item = {
  id: 'item-1',
  type: 'LOGIN',
  title: 'Example & account',
  icon: '',
  fields: [
    {
      id: 'field-1',
      label: 'Email',
      value: 'person@example.com',
      type: 'EMAIL',
      sensitive: false,
    },
    {
      id: 'field-2',
      label: 'Password',
      value: 'secret<&value',
      type: 'PASSWORD',
      sensitive: true,
    },
  ],
  notes: 'Private notes',
  backupCodes: 'code-1\ncode-2',
  labels: ['Work'],
  favourite: true,
  archived: true,
  createdAt: '2026-07-20T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
};

test('converts a compact Vault Nest backup into an encrypted SafeInCloud database', () => {
  const vaultPack = createVaultPack(
    [
      item,
      {
        ...item,
        id: 'deleted',
        title: 'Deleted item',
        deletedAt: '2026-07-22T12:00:00.000Z',
      },
    ],
    'NewVault#Password123',
    'backup-passphrase',
  );
  const snapshot = decryptVaultPack(vaultPack, 'backup-passphrase');
  const safeXml = toSafeInCloudXml(snapshot.items);
  assert.match(safeXml, /Example &amp; account/);
  assert.match(safeXml, /secret&lt;&amp;value/);
  assert.match(safeXml, /Vault Nest Archived/);
  assert.doesNotMatch(safeXml, /Deleted item/);

  const database = createSafeInCloudDatabase(safeXml, 'new-safe-password');
  const decrypted = decryptSafeInCloud(database, 'new-safe-password');
  assert.equal(decrypted.xml, safeXml);

  const parsed = parseSafeInCloud(decrypted.xml);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].title, 'Example & account');
  assert.equal(parsed.items[0].favourite, true);
  assert.equal(parsed.items[0].notes, 'Private notes');
  assert.equal(parsed.items[0].backupCodes, 'code-1\ncode-2');
  assert.deepEqual(parsed.items[0].labels, ['Work', 'Vault Nest Archived']);
  assert.equal(
    parsed.items[0].fields.find((field) => field.type === 'PASSWORD')?.value,
    'secret<&value',
  );
});

test('rejects an incorrect VaultPack passphrase', () => {
  const vaultPack = createVaultPack([item], 'NewVault#Password123', 'backup-passphrase');
  assert.throws(() => decryptVaultPack(vaultPack, 'wrong-passphrase'), /passphrase is incorrect/);
});
