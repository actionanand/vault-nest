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
- Light, dark, and automatic themes; manual clipboard clearing.
- Persisted failed-password limits with Unlimited as the default and explicit destructive warnings.
- Master-password-confirmed account removal and consent-confirmed vault database clearing.
- Android Capacitor configuration and signed/unsigned CI artifact workflow using the brand image.

## Next implementation slice

- Dedicated label management, recent activity, archive, trash, retention jobs, and item action menus.
- Password/value history with encrypted restore and deletion.
- Security findings with keyed reuse comparison and local weakness analysis.
- Expiry dashboard and local notification scheduling.
- TOTP generation and QR scanning.
- Encrypted attachment streaming through Filesystem/IndexedDB Blob repositories.

## Production-hardening slice

- Versioned encrypted `.vaultpack` backup, integrity validation, merge/replace transaction, duplicate resolution, and safety backup.
- Android Keystore and biometric quick unlock.
- Native optional screenshot protection with all/sensitive scope application.
- Password change by atomic vault-key rewrap.
- Failed-attempt delay and lockout countdown.
- Comprehensive repository, crypto, migration, component, backup, attachment, TOTP, accessibility, and Android integration tests.
- Independent cryptographic and mobile security review.

Do not market the repository as production-ready until all production-hardening items and the full test matrix pass on supported browser and Android versions.
