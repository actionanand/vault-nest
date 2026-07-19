# Database and migrations

## Browser schema (IndexedDB version 1)

`metadata` stores the primary vault header and preferences. `items` stores encrypted item records. Indexes exist for type, favourite, update time, archive state, deletion state, and expiry.

## Android schema (SQLite user_version 1)

`vault_metadata(id, payload)` stores the vault header and non-secret preferences. `vault_items` stores indexed metadata plus `encrypted_payload`. The schema creates the same practical indexes as IndexedDB.

SQLite database encryption is not treated as the security boundary. Sensitive fields are encrypted at the application layer before insertion. This preserves the same security model across Android and browser implementations.

## Migration rules

1. Never edit a released migration.
2. Add a new ordered migration and increment both the requested connection version and `PRAGMA user_version`.
3. Migrate encrypted formats through `VaultCryptoService`; do not decrypt values in SQL.
4. Run migrations inside a transaction and verify rollback with a failing-migration test.
5. Add compatible IndexedDB `onupgradeneeded` logic for equivalent browser changes.
6. Back up before destructive transforms and retain enough information to roll back.

## Repository rules

- No component imports a platform database API.
- No plaintext password or secret index is permitted.
- Search includes decrypted in-memory values only during an unlocked session and excludes sensitive fields by default.
- Record deletion should first set `deletedAt`; physical deletion belongs to confirmed trash cleanup.

## Clear operations

The storage abstraction deliberately exposes two scopes:

- `clearVaultData()` deletes all encrypted item records but preserves the vault header, preferences, and unlock-security state.
- `clearAll()` deletes item records and all metadata, including the wrapped vault key. It is used only for confirmed account removal or an explicitly configured failed-attempt limit.

Both Android operations execute inside SQLite database operations. The IndexedDB account-removal operation clears the `items` and `metadata` stores in one read-write transaction.

## Planned tables/stores

Value history, labels, item-label joins, attachments, security findings, recent activity, notification schedules, and backup transactions should become separate encrypted repositories. The schema must preserve streaming attachment access and avoid loading all blobs at once.
