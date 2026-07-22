# Vault Nest Android build guide

Vault Nest uses Capacitor and GitHub Actions to package the Angular application as Android APK and AAB artifacts. The workflow generates the `android/` directory in CI, so the native project is not committed.

The workflow supports both outcomes:

- When all signing secrets are configured and signing succeeds, it creates a signed APK and signed AAB.
- When the keystore is missing, secrets are incomplete, or signing fails, it creates clearly named unsigned APK and AAB files.

The build log and GitHub job summary show emoji-labelled artifact results such as `SIGNED APK`, `UNSIGNED APK`, `SIGNED AAB`, and `UNSIGNED AAB`, including the generated paths.

Android release-signing secrets are used only by `keytool`, `apksigner`, and `jarsigner` during CI. Vault Nest does not inject application-login secrets, master passwords, or SHA1 hashes into the app.

## Build files

| File                                  | Purpose                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `capacitor.config.ts`                 | App ID, app name, web output directory, Android background color, splash behavior, and notification icon configuration |
| `.github/workflows/android-build.yml` | Builds, optionally signs, verifies, summarizes, and uploads APK/AAB files                                              |
| `android-version.json`                | Stores Android `versionCode` and `versionName`                                                                         |
| `scripts/bump-android-version.js`     | Updates Android release version values                                                                                 |
| `scripts/patch-android.mjs`           | Adds Android backup/restore, biometric, system-bar, camera evidence, and notification-icon native patches              |
| `scripts/generate-keystore.mjs`       | Generates a PKCS12 Android release keystore                                                                            |
| `scripts/detect-keystore-format.mjs`  | Displays the keystore type                                                                                             |
| `public/vault-nest.png`               | Source image for launcher, splash, and Play Store icons                                                                |

## GitHub signing secrets

Add these under **Repository Settings -> Secrets and variables -> Actions**:

| Secret              | Purpose                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `KEYSTORE_BASE64`   | Base64 text containing the complete release keystore file                                |
| `KEYSTORE_PASSWORD` | Password used to open the keystore                                                       |
| `KEY_ALIAS`         | Alias of the signing key inside the keystore; the included generator uses `vaultnest`    |
| `KEY_PASSWORD`      | Password for the private key; for PKCS12 set it to the same value as `KEYSTORE_PASSWORD` |

All four values must be present before CI attempts signing. They are never written to logs. The decoded keystore is removed in an `always()` cleanup step.

## Generate KEYSTORE_BASE64

Generate a PKCS12 keystore once from a trusted WSL/Linux shell:

```bash
npm run generate-keystore
```

Or provide the password non-interactively only in a trusted local shell:

```bash
npm run generate-keystore -- --password 'YOUR_STRONG_PASSWORD'
```

The generator uses OpenSSL and does not require Java or `keytool`. OpenSSL is
normally already available in WSL2. Verify it with:

```bash
openssl version
```

If OpenSSL is missing, install it yourself in WSL2 and rerun the generator:

```bash
sudo apt update
sudo apt install -y openssl
```

The output is `release-keystore.jks` with alias `vaultnest`. Despite the `.jks` filename, its internal format is PKCS12.

Verify the keystore type:

```bash
KEYSTORE_PASSWORD='YOUR_STRONG_PASSWORD' \
  openssl pkcs12 -in release-keystore.jks \
  -passin env:KEYSTORE_PASSWORD -info -noout
```

Generate the GitHub secret value in WSL/Linux:

```bash
test -s release-keystore.jks && base64 -w 0 release-keystore.jks > keystore.b64.txt
```

The `test -s` guard prevents creation of an empty `keystore.b64.txt` when the
keystore is missing. If an earlier failed command created an empty file, it is
safe to delete that empty file and run the guarded command after generation.

On macOS:

```bash
base64 < release-keystore.jks | tr -d '\n' > keystore.b64.txt
```

Copy the single-line content of `keystore.b64.txt` into `KEYSTORE_BASE64`. Store the original keystore and passwords in a secure offline backup. Never commit `release-keystore.jks` or `keystore.b64.txt`. Losing the release key can prevent future Play Store updates.

## Build flow

1. GitHub installs Node 24.16, Java 21, and the Android SDK.
2. `npm ci` installs locked dependencies.
3. CI increments `android-version.json`, commits it with `[skip ci]`, and pushes it using the workflow token.
4. Angular builds `dist/vault-nest/browser`.
5. Capacitor generates and syncs the Android project using `com.actionanand.vaultnest.app`.
6. `scripts/patch-android.mjs` reads the generated Capacitor app ID and applies native backup/restore, biometric, intrusion-evidence, system-bar, and notification-icon patches to the matching Java package.
7. CI applies the updated `versionCode` and `versionName` from `android-version.json`, minimum SDK 24, and target SDK 35.
8. ImageMagick generates launcher, round, foreground, splash, and Play Store icons from `public/vault-nest.png`.
9. Gradle receives those version values as project properties and creates unsigned release APK/AAB inputs.
10. If all signing secrets exist, CI decodes the keystore, detects its type, signs, and verifies both artifacts.
11. If no keystore is available or signing fails, CI copies clearly named unsigned artifacts.
12. The console and GitHub job summary report only artifacts that actually exist; an earlier failure is reported without failing the summary step itself.
13. For a `main-android` build, CI removes older APK/AAB files, then commits the generated versioned APK, AAB, APK signature sidecar, and Play Store icon into the branch's `releases/` directory with `[skip ci]`.
14. The same APK, AAB, and Play Store icon are also uploaded as downloadable workflow artifacts retained for 30 days.

Signed outputs:

Release filenames include `versionName` from `android-version.json` with dots
replaced by hyphens. For example, `1.0.3` becomes:

```text
releases/vault-nest-release-1-0-3.apk
releases/vault-nest-release-1-0-3.aab
```

After a successful `main-android` workflow, these files are visible directly in
the branch under `releases/`. Files created on a GitHub-hosted runner are
temporary until the workflow explicitly commits or uploads them; a successful
signing log alone does not add files to the Git branch.

Unsigned fallback outputs:

```text
releases/vault-nest-release-1-0-3-unsigned.apk
releases/vault-nest-release-1-0-3-unsigned.aab
```

## Android features

Vault Nest's Android shell is generated from Capacitor and patched by CI. The patch adds:

- Android Keystore-backed biometric unlock.
- System document picker support for encrypted backup and restore.
- A private Android Keystore-backed intrusion-evidence store.
- Camera permission for opt-in intrusion evidence.
- Light/dark system-bar handling for automatic, light, and dark themes.
- A white transparent notification small icon named `ic_stat_vault_nest`.

Credential notification copy shortcuts use `@capacitor/local-notifications` and `@capacitor/clipboard`. Username, email, and password values are not placed in notification metadata; they remain in app memory for the short copy window and are cleared after expiry.

## Local Android workflow

The normal workflow is GitHub Actions. If you need to troubleshoot the native shell locally, first create the generated Android project:

```bash
npm run build
npm run android:add
npm run android:sync
```

Open it with Android Studio from the appropriate host environment:

```bash
npm run android:open
```

After `android/` exists, this command rebuilds web assets, synchronizes Capacitor, and reapplies the idempotent native patch:

```bash
npm run android:sync
```

If `android/` has not been added yet, `npx cap sync android` reporting that the Android platform is missing is expected.

## Versioning

```bash
npm run android:version
npm run android:version:patch
npm run android:version:minor
npm run android:version:major
```

The plain command increments only `versionCode`. Patch, minor, and major commands also update `versionName`.

`versionCode` must always increase for every Android release uploaded to Play Console.

## Trigger the workflow

Run **Actions -> Android APK and AAB -> Run workflow**, push `main-android`, or push a `v*` tag.

```bash
git checkout main-android
git merge main
git push origin main-android
```

## Security notes

- `public/vault-nest.png` is the canonical launcher, splash, and Play Store icon source.
- Android notification small icons must be white artwork on a transparent background; Android applies the final light/dark system tint.
- Encrypted backup and restore use Android's system document picker and do not need broad storage permission.
- Biometric unlock wraps the vault key with an Android Keystore key that is invalidated when biometric enrollment changes.
- Intrusion evidence is opt-in, stored in the app's private files directory, encrypted with a separate non-exportable Android Keystore key, and excluded from backups.
- Release keystore files and generated base64 text files must never be committed.

## SDK versions

```yaml
MIN_SDK_VERSION: 24
TARGET_SDK_VERSION: 35
```

Raise the target SDK when Google Play requirements change and verify Capacitor compatibility before merging.
