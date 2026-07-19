# Security model

## Cryptographic design

- A cryptographically random 256-bit vault encryption key encrypts vault records.
- PBKDF2-HMAC-SHA-256 currently uses a random 32-byte salt and 600,000 iterations to derive the master-password wrapping key.
- AES-256-GCM provides confidentiality and authentication.
- Every encryption creates a fresh 96-bit IV with `crypto.getRandomValues()`.
- Additional authenticated data binds ciphertext to its purpose (`vault-key:v1` or `item:<uuid>`).
- Envelopes are versioned so future formats can be migrated deliberately.
- The master password and derived wrapping key are never persisted.

The work factor is versioned in `VaultHeader`. Benchmark it on the minimum supported Android hardware before release and adjust it to the desired unlock latency. Do not silently reduce it for production.

## Stored plaintext metadata

Item IDs, types, favourite/archive/trash flags, expiry dates, and timestamps remain visible to the database so indexed lists can work. Titles, usernames, passwords, notes, labels, and all fields are inside the encrypted payload. This is a deliberate leakage profile and must be disclosed in threat-model reviews.

## Browser constraints

Web Crypto keys remain in the current JavaScript process while unlocked. Browser storage is IndexedDB only. A browser cannot reliably block operating-system screenshots, and the UI says so.

## Android release work

Before a production security claim, complete and audit:

1. Android Keystore-backed protection for device-bound quick unlock.
2. Biometric authentication and explicit fallback behavior.
3. Optional `FLAG_SECURE`, respecting disabled/all/sensitive scope settings.
4. Encrypted attachment streaming in the private app filesystem.
5. Rooted-device and backup-policy review without claiming impossible guarantees.

## Clipboard

Copy actions write the selected value and announce what was copied. Vault Nest never schedules automatic clipboard clearing. Users can explicitly clear it in Settings.

## Password changes

The architecture supports rewrapping the random vault key with a new derived key. A password-change workflow must authenticate the old password, generate a new salt, derive a new wrapping key, atomically replace the header, and retain a rollback copy until the transaction commits.

## Recovery

There is no account and no master-password recovery. The setup screen requires explicit acknowledgement that losing the master password may make the vault permanently inaccessible.

## Failed unlock attempts

The default is unlimited attempts. Users may explicitly select 3, 5, or 10 attempts in Settings. Enabling a finite limit requires consent through a destructive confirmation dialog, resets the persisted failure counter to zero, and displays a continuing warning. Each incorrect master password increments the database-backed counter; a successful unlock resets it. Reaching the configured threshold clears the vault header, preferences, counters, and all encrypted items.

This option can cause irreversible denial of access if another person repeatedly attempts to unlock the device. Keep Unlimited unless the user understands and accepts that risk. It is not a substitute for Android device security, rate limiting, or a secure backup.

## Destructive data actions

“Remove account” requires the current master password and an explicit acknowledgement. It clears all Vault Nest database content and returns to first-time setup. “Clear vault database” uses a reusable confirmation dialog and removes saved vault items while preserving the master-password setup and preferences. Neither action is recoverable without a previously created valid backup.
