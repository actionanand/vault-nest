# Android and CI/CD

## Dependency setup

Install and commit package changes from WSL2. Do not run an Angular or Capacitor Android build locally unless explicitly troubleshooting the native shell. The Android project is generated rather than committed by the current workflow, so `npx cap sync android` alone will correctly report that the platform has not been added.

`capacitor.config.ts` defines `com.actionanand.vaultnest.app`, the Vault Nest display name, Android background colour, and notification icon name. The app uses only feature-specific Capacitor plugins; broad storage permission is not required for file-picker based imports and exports.

Credential copy shortcuts require both `@capacitor/local-notifications` and `@capacitor/clipboard`. Permission is requested only when the user invokes the Android-only notification action. Selected username, email, and password values remain available from those notifications for three minutes after sending, including while the vault is locked; the notification metadata never contains the values. The native shell also schedules notification dismissal at the three-minute expiry and clipboard clearing at the five-minute clipboard window.

## GitHub Actions

`.github/workflows/android-build.yml` runs manually, on `main-android`, or for `v*` tags. It:

1. Restores locked npm dependencies.
2. Builds Angular production assets.
3. Generates and synchronises the Capacitor Android project.
4. Applies SDK and app versions.
5. Generates launcher, round, foreground, notification, store, and branded splash images from `public/vault-nest.png`.
6. Applies the native Android shell patch after asset generation so branded splash resources and dark-mode system-bar styles are final.
7. Clears older APK/AAB files from `releases/` and writes the current artifacts with a versioned basename such as `vault-nest-release-1-0-3`.
8. Builds release APK and AAB files.
9. Signs when repository secrets exist; otherwise uploads clearly named unsigned artifacts.
10. Removes the decoded keystore and uploads artifacts for 30 days.

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

## Native patches applied by CI

`scripts/patch-android.mjs` adds the backup document picker, Android Keystore biometric bridge, screenshot-protection bridge, native splash overlay, light/dark system-bar bridge, biometric permission and dependency, and a monochrome status-bar notification vector. Android notification icons must be white-alpha silhouettes; the notification accent color follows Vault Nest's resolved light/dark theme. The patch also writes Android 12+ splash styles so cold starts do not show a plain white screen.

The patch also declares Android camera permission and provides the Keystore-backed private-file bridge used by opt-in intrusion evidence. Camera permission is requested only when the owner enables the setting. No camera framework dependency is added: the Capacitor WebView captures the explicitly permitted front-camera frame and hands the JPEG to native encryption immediately.
