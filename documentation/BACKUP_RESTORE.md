# Encrypted backup and restore

## File format

Vault Nest exports `.vaultpack` files. The outer JSON envelope is versioned and contains only PBKDF2 parameters, an AES-GCM IV, creation time, optional compression metadata, and ciphertext. Legacy decrypted version-1 snapshots contain:

- the wrapped vault key header;
- encrypted item records and their indexed metadata;
- vault preferences;
- the failed-unlock security state.

New version-2 compact snapshots contain the item structure and raw random vault key only inside the encrypted envelope, allowing effective compression before encryption. The complete snapshot is encrypted with AES-256-GCM using a key derived from the separate backup passphrase with PBKDF2-HMAC-SHA-256 and 600,000 iterations. The backup passphrase must contain at least eight characters. It is never stored.

The backup passphrase protects the `.vaultpack` file. It does not replace the vault's master password. After restoration, the user must unlock with the master password that belonged to the restored vault.

## Create workflow

1. Open **Settings > Data > Create encrypted backup**.
2. Enter and confirm a backup passphrase.
3. Vault Nest reads a consistent logical snapshot from the storage abstraction, optionally compresses it, and encrypts it.
4. Android opens the system create-document picker. Browser builds use file sharing when supported and fall back to a download.

The Android picker can save through any installed Storage Access Framework provider, including local storage and compatible Drive, OneDrive, Dropbox, or ownCloud provider apps. Vault Nest does not receive cloud credentials.

Background and inactivity locking are paused only while the app-owned create/open document picker is active, because Android temporarily backgrounds the activity. The pause ends on success, cancellation, or error. It does not apply to unrelated external activity.

## Restore workflow

1. Open **Settings > Data > Restore encrypted backup** and select a `.vaultpack` file.
2. Enter its backup passphrase.
3. Explicitly confirm replacement of the current vault.
4. Vault Nest authenticates and validates the complete file before replacing storage in one IndexedDB transaction or one SQLite transaction.
5. Notification copy shortcuts and decrypted in-memory state are cleared.
6. The application fully reloads so storage connections, authentication state, theme, and preferences are re-created from the restored database.
7. Unlock using the restored vault's original master password.

An incorrect passphrase, damaged authentication tag, unsupported format, or invalid decrypted snapshot is rejected before database replacement.

## Android CI integration

The native Android project is generated only in GitHub Actions. After `npx cap add android` and `npx cap sync android`, `scripts/patch-android.mjs` adds a small `VaultNestNative` document-picker bridge to the generated `MainActivity`. This follows the reference application's system-picker design and avoids broad storage permissions.

Keep at least two independent backup copies and test restoration with non-essential data before depending on a backup.

## Backup size and compact format

New backups decrypt item records only in memory, place the plaintext items and the raw vault key inside the passphrase-encrypted backup envelope, gzip that payload, and then encrypt it with AES-256-GCM. Compressing before encryption is materially smaller than attempting to compress the independently encrypted database records. The plaintext snapshot and raw vault key are never written outside the encrypted `.vaultpack` envelope.

Easy-login and biometric settings are device-specific and are deliberately disabled in a restored backup. The original full master password remains the required fallback after restore. Version 1 backups containing encrypted database records remain supported.
