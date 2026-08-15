# Android and Wear OS identity, SDKs, versions, and artifacts

Vault Nest ships a phone application and a Wear OS companion. They use the same Play application
identity and signing certificate, but they are built from separate projects and use independent
version sequences.

## Application identity and display name

The phone identity is configured in `capacitor.config.ts`:

- application ID: `com.actionanand.vaultnest.app`
- display name: `Vault Nest`

The Wear identity is configured in `wear-config.json`:

- application ID: `com.actionanand.vaultnest.app`
- Kotlin namespace: `com.actionanand.vaultnest.wear`
- display name: `Vault Nest`

The matching application ID and signing certificate let Google Play associate both artifacts with
the same listing and let the Wear Data Layer authenticate communication between the phone and watch.
The Kotlin namespace is intentionally different because it identifies source code, not the Play
application. The display name may be changed independently, but keeping `Vault Nest` on both devices
makes the relationship clear to users.

## Wear SDK settings

`.github/workflows/build-wear.yml` declares these values:

| Variable                      | Current value | Purpose                                                                                       |
| ----------------------------- | ------------: | --------------------------------------------------------------------------------------------- |
| `WEAR_MIN_SDK_VERSION`        |            30 | Oldest Android/Wear API on which the APK may be installed.                                    |
| `WEAR_TARGET_SDK_VERSION`     |            36 | API level whose runtime behavior the app targets and has been tested against.                 |
| `WEAR_COMPILE_SDK_VERSION`    |            36 | Android API package used by the compiler. It controls which APIs are available at build time. |
| `ANDROID_BUILD_TOOLS_VERSION` |        36.0.0 | Exact compiler, packager, `zipalign`, and `apksigner` toolset installed in CI.                |

The Android platform and Android Build Tools are different SDK packages. The platform contains the
API definitions for one Android API level. Build Tools contains programs that compile, package,
align, and sign application files. `ANDROID_PLATFORM` was therefore renamed to the explicit
`WEAR_COMPILE_SDK_VERSION`; it was never the minimum supported watch version.

The Wear Gradle build reads these CI variables. It uses 30/36/36/36.0.0 as local fallbacks so Android
Studio and command-line builds behave consistently outside GitHub Actions.

## Version names and version codes

`android-version.json` controls the phone version and supplies the semantic base for Wear names.
`wear-version.json` controls the independent Wear `versionCode` and manually edited `wearRevision`.

`versionName` is a user-facing release label. A suffix such as `1.0.15-wear.1` is not required by
Android or Google Play; it is a Vault Nest convention that makes a Wear build unmistakable in Play
Console, CI logs, and support reports. The build combines the Android semantic base with the manual
Wear revision: Android `1.0.15` and `wearRevision: 2` produce `1.0.15-wear.2`. CI does not modify the
revision. When the Android base becomes `1.0.16`, manually choose the next revision, normally `1`.

`versionCode` is the integer Google Play uses for update ordering. Version codes must not collide
between APKs/AABs uploaded under the same application ID. Wear starts at `2000` as a reserved project
range so its independently generated releases do not collide with the phone sequence. The number
2000 itself is not an Android requirement; any unused positive range would work. CI increments only
the Wear code on each `main-wear` build. You control `wearRevision`; CI does not change the Android
semantic version or Wear revision.

## Build branches and artifact locations

The phone workflow runs from `main-android` and commits its latest files to `releases/` on that
branch. The Wear workflow runs from `main-wear` and commits its latest files to `releases/wear/` on
that branch:

- `vault-nest-wear-debug.apk`
- `vault-nest-wear-release.apk`
- `vault-nest-wear-release.aab`

The Wear files are also uploaded as a downloadable GitHub Actions artifact named
`vault-nest-wear-VERSION_NAME` and retained for 30 days. The branch is not created automatically. To
create it the first time from the intended source branch, use:

```bash
git switch -c main-wear
git push -u origin main-wear
```

After that, Wear-related pushes to `main-wear` start the dedicated workflow. A manual workflow run
from another branch builds and uploads the Actions artifact but does not increment versions or
commit binaries.

### Release ownership and collision protection

The workflows have non-overlapping ownership:

| Workflow | Branch         | Version file it may bump               | Release files it may replace       |
| -------- | -------------- | -------------------------------------- | ---------------------------------- |
| Android  | `main-android` | `android-version.json`                 | Root phone files under `releases/` |
| Wear OS  | `main-wear`    | `wear-version.json` `versionCode` only | Files under `releases/wear/`       |

Android cleanup matches only `releases/vault-nest-release-*` and never recursively deletes the
`releases/wear/` directory. Wear cleanup runs only inside `releases/wear/`. Before committing, each
workflow checks the other workflow's owned path and fails if it detects an unexpected change. Git
staging also excludes the other workflow's path. Therefore merging the branches or retaining both
sets of files in one checkout cannot cause one build to delete or commit the other's artifacts.

## Official references

- [Package and distribute Wear OS apps](https://developer.android.com/training/wearables/packaging)
- [Configure the Android build](https://developer.android.com/build)
- [Android SDK Build Tools release notes](https://developer.android.com/tools/releases/build-tools)
- [Android SDK Platform release notes](https://developer.android.com/tools/releases/platforms)
