# Android and CI/CD

## Local setup

Install packages from WSL2, then run the Capacitor commands documented in the README. The Android project is generated rather than committed by the current workflow.

`capacitor.config.ts` defines `app.vaultnest.mobile`, the Vault Nest display name, Android background colour, and notification icon name. The app uses only feature-specific Capacitor plugins; broad storage permission is not required for file-picker based imports and exports.

## GitHub Actions

`.github/workflows/android-build.yml` runs manually, on `main-android`, or for `v*` tags. It:

1. Restores locked npm dependencies.
2. Builds Angular production assets.
3. Generates and synchronises the Capacitor Android project.
4. Applies SDK and app versions.
5. Generates launcher, round, foreground, store, and branded splash images from `public/vault-nest.png`.
6. Builds release APK and AAB files.
7. Signs when repository secrets exist; otherwise uploads clearly named unsigned artifacts.
8. Removes the decoded keystore and uploads artifacts for 30 days.

## Required GitHub secrets

- `KEYSTORE_BASE64`: base64 encoding of the release keystore.
- `KEYSTORE_PASSWORD`: keystore password.
- `KEY_ALIAS`: signing-key alias.
- `KEY_PASSWORD`: key password.

Keep a secure independent keystore backup. Losing the release key can prevent updates to an already distributed application.

## Release checklist

- Update `android-version.json`; `versionCode` must always increase.
- Confirm the lock, background, screenshot, biometric, notification, and file-picker flows on a physical Android device.
- Run unit, accessibility, and migration tests.
- Inspect APK/AAB signing and Play integrity metadata.
- Verify the splash and launcher assets on multiple densities.
- Ensure logs contain no decrypted values or user-entered secrets.
