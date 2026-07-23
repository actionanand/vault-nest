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

## Android release review

Android Keystore-backed biometric unlock is implemented with the full master password retained as the fallback. Before a production security claim, audit the generated native bridge, `FLAG_SECURE` behavior, rooted-device and Android-backup policies, and any future encrypted attachment streaming.

## Clipboard

Copy actions write the selected value, announce what was copied, and schedule an overwrite with an empty value after five minutes. Users can also clear it immediately in Settings. Browser clearing depends on the WebView timer. Android also asks the native shell to clear the clipboard after five minutes, but the operating system can still kill the process, so automatic clearing remains best effort.

The item Share dialog excludes notes, password, PIN, secret, OTP, hidden, and explicitly sensitive fields by default. Including them requires a deliberate checkbox selection and displays a warning before Copy or system Share. When included, those values become readable clipboard/share text outside Vault Nest's encryption boundary.

### Android notification copy shortcuts

The Android-only arrow-up-to-line action creates immediate native Android notifications for populated username, email, and password fields. Notification metadata and immutable pending intents contain only an ephemeral numeric lookup ID, not the credential value, vault item ID, or field ID.

Sending the shortcuts creates an explicit three-minute exception for only the selected values. Android Keystore AES-GCM encrypts them in app-private preferences, and a non-exported, no-display activity decrypts only the selected value when the user taps its notification. The activity receives foreground clipboard authority from the user-initiated notification tap, immediately finishes without showing Vault Nest, and returns focus to the app being filled. Locking still clears the vault key and decrypted vault records; it is never deferred for this feature.

Every tap verifies the deadline before decrypting or copying. At expiry, the encrypted shortcut is deleted and Vault Nest attempts to cancel scheduled and delivered notifications. The Android shell also schedules native notification cancellation for the same three-minute expiry. Clearing the vault database, removing the account, or automatic account deletion immediately invalidates the shortcuts.

JavaScript and Java strings cannot be reliably zeroed in place, so this feature deliberately trades a bounded three-minute encrypted shortcut exposure for locked-vault notification copying. The copied value is marked sensitive for Android clipboard previews and remains subject to the separate five-minute clipboard policy below.

## Password changes

The architecture supports rewrapping the random vault key with a new derived key. A password-change workflow must authenticate the old password, generate a new salt, derive a new wrapping key, atomically replace the header, and retain a rollback copy until the transaction commits.

## Recovery

There is no account and no master-password recovery. The setup screen requires explicit acknowledgement that losing the master password may make the vault permanently inaccessible.

## Failed unlock attempts

The default is unlimited attempts. Users may explicitly select 3, 5, or 10 attempts in Settings. Enabling a finite limit requires consent through a destructive confirmation dialog, resets the persisted failure counter to zero, and displays a continuing warning. Each incorrect master password increments the database-backed counter; a successful unlock resets it. Reaching the configured threshold clears the vault header, preferences, counters, and all encrypted items.

This option can cause irreversible denial of access if another person repeatedly attempts to unlock the device. Keep Unlimited unless the user understands and accepts that risk. It is not a substitute for Android device security, rate limiting, or a secure backup.

Unlimited attempts do not permit continuous guessing. Five failures less than one minute apart trigger a persisted cooldown. Successive five-failure groups use 1, 5, 10, 30, 60, and then 720-minute cooldowns; later groups remain capped at 12 hours. Waiting at least one minute before completing a five-failure group resets that partial group. A successful master-password, easy-login, or biometric unlock resets the cooldown escalation.

When a finite limit is reached using easy login, Vault Nest suspends easy login instead of immediately deleting the vault. The user gets three full-master-password attempts or may authenticate with Android biometrics. Three failed full-password verification attempts then permanently remove the account. Direct full-master-password failures continue to use the explicitly selected finite deletion limit.

## Intrusion evidence and password logging

Vault Nest deliberately does not store attempted passwords. Doing so would create a second credential database containing likely master-password variations and would materially weaken the vault.

The Android-only intrusion-evidence option is disabled by default and requires the device owner to enable it in Settings and grant front-camera permission. After the third continuous failed unlock, the WebView captures one front-camera frame and immediately passes it to the native bridge. The native bridge encrypts the JPEG with AES-GCM under a separate non-exportable Android Keystore key and writes only ciphertext in private application storage. Android displays its normal camera privacy indicator during capture. Permission revocation, an unavailable front camera, or capture failure never delays unlock handling.

After successful password or biometric authentication, retained evidence is shown with its timestamp. The owner may keep it, download a decrypted copy, or permanently delete it after confirmation. Removing the Vault Nest account deletes every evidence file and the device encryption key. Evidence is device-specific and excluded from `.vaultpack` backups.

## Destructive data actions

Archive is non-destructive but still requires confirmation and moves the item out of normal lists. Trash retains deleted items for the configured 7, 30, or 90 days, or indefinitely when Never is selected. Expired trash is physically deleted when the unlocked vault loads. Manual permanent deletion requires a second acknowledgement.

`.vaultpack` backups encrypt the complete logical snapshot with a separate passphrase-derived AES-256-GCM key. Restore authenticates and validates the file before atomically replacing local storage, then clears decrypted state and locks the application. See `BACKUP_RESTORE.md` for the format and Android document-picker boundary.

“Remove account” requires the current master password and an explicit acknowledgement. It clears all Vault Nest database content and returns to first-time setup. “Clear vault database” uses a reusable confirmation dialog and removes saved vault items while preserving the master-password setup and preferences. Neither action is recoverable without a previously created valid backup.

## Convenience unlock

Easy login is disabled by default. If enabled, the user explicitly chooses the first or last four normalized characters of the master password. Those four characters derive a separate PBKDF2-SHA-256 key (600,000 iterations) which wraps the random vault key with AES-GCM. The full master password is never stored and remains available as a fallback. Four characters provide much less entropy, so the UI warns the user and failed attempts share the configured destructive attempt counter.

On Android, biometric unlock stores only an AES-GCM-wrapped vault key. Its wrapping key is generated in Android Keystore, requires a successful strong-biometric prompt for every use, and is invalidated when biometric enrollment changes. Disabling biometrics or removing the account deletes the native key and wrapped material. Browser builds do not expose biometric unlock.

## Clipboard lifetime

Vault Nest overwrites app-copied clipboard values after five minutes while its process remains alive. On Android, the native shell also schedules the same clipboard clear so it is not dependent only on Angular change detection or visiting Settings. Mobile operating systems may still kill the process, so this is a best-effort timeout rather than a guarantee; users can always use **Clear clipboard now**. Notification copy shortcuts use a shorter three-minute lifetime and are removed after expiry.
