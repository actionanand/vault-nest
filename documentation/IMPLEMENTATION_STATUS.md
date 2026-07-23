# Implementation status and roadmap

This document distinguishes shipped code from product requirements. A visible placeholder is not a completed security feature.

## Implemented foundation

- Lazy-loaded Angular routes and reusable mobile-first UI.
- First-run master-password setup and irreversible-loss acknowledgement.
- Random vault key, PBKDF2 wrapping, AES-GCM record encryption, and versioned envelopes.
- IndexedDB browser adapter and SQLite Android adapter behind one storage abstraction.
- Lock/unlock, manual lock, inactivity lock, and optional background lock.
- Login, note, identity, Wi-Fi, and custom-item editor presets.
- Unlimited dynamic fields with duplicate, remove, move-up, and move-down actions.
- Vault list, responsive details pane, reveal/copy, favourites, labels, expiry, notes, and safe-field search.
- Secure random password generator with local entropy classification.
- Light, dark, and automatic themes; five-minute best-effort clipboard clearing with Android native delayed cleanup.
- Persisted failed-password limits with Unlimited as the default and explicit destructive warnings.
- Persisted unlimited-mode cooldown escalation and finite easy-login full-password/biometric recovery.
- Opt-in Android front-camera intrusion evidence with Keystore encryption, timestamped post-login review, download, retention, and confirmed deletion.
- Master-password-confirmed account removal and consent-confirmed vault database clearing.
- Responsive credential details on mobile and desktop with labels, confirmed archive/trash actions, editable/deletable reusable templates, safe custom-template reset, duplicate, and consent-based sensitive sharing.
- Dedicated Archive and Trash views with restore, permanent deletion, and configurable automatic retention.
- Versioned, passphrase-encrypted `.vaultpack` backup and transactional restore through browser and Android system file pickers.
- Android-only username/email/password notification copy shortcuts with a three-minute locked-vault window, Android Keystore-encrypted temporary storage, foreground-authorized no-display copy handling, native delayed notification cleanup, and no plaintext credential values in notification text or pending intents.
- Android-only credential expiry reminders scheduled three days before expiry, with stable rescheduling and cleanup when credentials become inactive or are deleted.
- Optional first-four/last-four easy login and Android Keystore-backed strong-biometric unlock, both with the full master password as fallback.
- Compact gzip-before-encryption backups, safe-area mobile navigation, theme-aware Android system bars, branded native splash resources, padded launcher icons, optional Android screenshot blocking, and monochrome notification icons.
- Android Capacitor configuration and signed/unsigned CI artifact workflow using the brand image.

## Next implementation slice

- Dedicated label management and recent activity.
- Password/value history with encrypted restore and deletion.
- Security findings with keyed reuse comparison and local weakness analysis.
- Expiry dashboard.
- TOTP generation and QR scanning.
- Encrypted attachment streaming through Filesystem/IndexedDB Blob repositories.

## Production-hardening slice

- Backup merge mode, duplicate resolution, and automatic pre-restore safety backup.
- Screenshot-protection scope refinement between all screens and sensitive-only screens.
- Password change by atomic vault-key rewrap.
- Failed-attempt delay and lockout countdown.
- Comprehensive repository, crypto, migration, component, backup, attachment, TOTP, accessibility, and Android integration tests.
- Independent cryptographic and mobile security review.

Do not market the repository as production-ready until all production-hardening items and the full test matrix pass on supported browser and Android versions.
