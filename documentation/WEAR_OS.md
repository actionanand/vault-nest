# Vault Nest Wear OS companion

Vault Nest Wear is a separate native Kotlin application under `wear/`. It is a read-only emergency
vault for a small user-selected set of credentials. The phone remains the source of truth. After a
successful sync, the watch can unlock and display its encrypted local copy without the phone,
internet, or cloud services.

## Entry limit

The single product setting is `WATCH_VAULT_MAX_ENTRIES` in
`src/environments/watch-vault.environment.ts`; its default is `5`. Both Angular environments import
it. The phone Android patch script embeds the same value in `WatchVaultPlugin.java`, and the Wear
Gradle build reads it into `BuildConfig.WATCH_VAULT_MAX_ENTRIES`. Both native receivers reject
oversized payloads, so changing capacity later requires editing only that environment file.

## Phone workflow

1. Unlock Vault Nest and open **Watch Vault** from the side navigation.
2. Select items that contain a password. Only item IDs are persisted as phone selection state.
3. Tap **Sync to Watch**. The current primary username and primary password are resolved from the
   unlocked vault only at that moment.
4. Open Vault Nest on the watch and complete Watch PIN setup before the first sync. The first sync
   initiates secure key pairing; retry once the pairing response reaches the phone.
5. Changed or removed selected entries display **Sync required** until the next explicit sync.

Deleting, archiving, or converting a selected item to a template removes its Watch Vault selection.
Clearing Watch Vault requires explicit confirmation and sends an authenticated clear message to
connected trusted watches. Encrypted phone backups may retain the selected item IDs, but device-local
watch sync timestamps are reset so a restored vault always requires a fresh secure sync.

## Separate GitHub Actions build

Open **Actions → Build Vault Nest Wear → Run workflow**. The independent workflow is
`.github/workflows/build-wear.yml`; it does not modify the existing phone build workflow. Pushes to
the dedicated `main-wear` branch also run it when Wear-related files change.

`android-version.json` supplies the semantic base such as `1.0.15`. `wear-version.json` keeps the
independent Wear `versionCode` and the manually controlled `wearRevision`. The final name is composed
at build time: Android `1.0.15` plus `wearRevision: 1` becomes `1.0.15-wear.1`.

Before a new Wear release, manually increase only `wearRevision` from `1` to `2`, and so on. If the
Android base changes, choose the desired Wear revision, normally resetting it to `1`. On `main-wear`,
CI automatically increments only the Wear `versionCode` starting from the reserved 2000 range and
commits that change with `[skip ci]`.

Manual builds from another branch use the current value without modifying it. This command mirrors
CI and increments only `versionCode`; it does not change `wearRevision`:

```bash
npm run wear:version
```

It requires the same repository secrets used by the phone build:

- `KEYSTORE_BASE64`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

The workflow restores the keystore only for the job, prepares the existing `public/vault-nest.png`
brand icon, runs Wear unit tests, builds and verifies signed artifacts, and commits the latest files
to `main-wear/releases/wear`. It also uploads a versioned `vault-nest-wear-VERSION_NAME` Actions
artifact containing:

- `vault-nest-wear-debug.apk`
- `vault-nest-wear-release.apk`
- `vault-nest-wear-release.aab`

SDK, identity, version-name, version-code, branch, and artifact-location conventions are documented
in `documentation/ANDROID_WEAR_IDENTITY_VERSIONING.md`.

Phone and Wear artifacts have protected ownership boundaries. Android owns the root phone artifacts
in `releases/`, while Wear owns only `releases/wear/`. Neither workflow cleans or stages the other
directory, and both workflows fail before committing if that boundary is crossed.

## Installing without Android Studio

The easiest route is Google Play internal testing: upload the release AAB as a Wear OS release, add
your account as a tester, and install from Play Store on the watch.

For direct testing, enable Developer options and wireless debugging on the watch, install only the
Android SDK Platform Tools (`adb`), pair using the address/code shown by Wear OS, and run:

```bash
adb pair WATCH_IP:PAIR_PORT
adb connect WATCH_IP:DEBUG_PORT
adb install -r vault-nest-wear-debug.apk
```

Android Studio, a local Kotlin compiler, emulator, and local Gradle installation are not required for
the CI-produced APK.

## Play compatibility

The Kotlin namespace is `com.actionanand.vaultnest.wear`, while its application ID intentionally
remains `com.actionanand.vaultnest.app`. Wearable Data Layer requires the phone and watch packages to
share the application ID and signing certificate. The module declares the watch hardware feature,
has a Wear launcher, targets API 36, and uses the phone signing identity. It is marked non-standalone
for Play metadata because initial credential provisioning requires the companion phone; the watch
remains fully usable offline after a successful sync.

Wear reads its version from `wear-version.json`. Its sequence starts at `2000` to remain separate from
the existing phone version-code range and then increments independently. Every Wear version code
uploaded to Play must remain unique and greater than the previous Wear release. Configure a Wear OS
form-factor release in the existing Play Console application and upload the signed AAB.

## Limitations

- Version 1 sync is explicit; it does not run a permanent background service or poll the watch.
- The first secure pairing is authenticated by the OS-paired Wear Data Layer relationship. There is
  no additional human-readable pairing code in this version.
- Only the first password and first username/email field from each selected item are included.
- Clipboard behavior varies by Wear OS version; viewing is the primary emergency-access path.
- The phone may report a send before the asynchronous acknowledgement arrives. Last acknowledgement
  is retained by the native bridge without credential content.
