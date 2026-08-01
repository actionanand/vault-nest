# Android native debug symbols

## Purpose

Vault Nest includes native Android libraries through Capacitor plugins such as SQLite. Google Play
can install and run the application without native debug symbols, but native crashes and ANRs are
much harder to diagnose because their stack traces contain library addresses instead of useful
function names.

Native symbols are separate from the R8 `mapping.txt` file:

- `mapping.txt` deobfuscates optimized Java and Kotlin stack traces.
- `native-debug-symbols.zip` symbolicates crashes from native `.so` libraries.

## Build configuration

The Android project is generated during CI. `scripts/patch-android.mjs` adds the following setting
to the generated release build type:

```groovy
ndk {
    debugSymbolLevel 'SYMBOL_TABLE'
}
```

`SYMBOL_TABLE` supplies native function names while keeping the symbol payload smaller than `FULL`,
which can additionally contain source filenames and line numbers. This setting does not change
application behavior or expose signing credentials, master passwords, or vault contents.

For an Android App Bundle, the Android Gradle Plugin includes available native symbol metadata in
the AAB so Google Play can normally associate it automatically.

## CI handling

For an AAB build, Gradle can place available symbols directly under the bundle's
`BUNDLE-METADATA/com.android.tools.build.debugsymbols/` directory. In that case no separate ZIP is
required because Google Play reads the metadata from the uploaded AAB.

For builds where Gradle also produces a standalone archive, its usual location is:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

GitHub Actions discovers a standalone archive instead of assuming the path always exists. When
present, CI copies it to:

```text
releases/vault-nest-release-<version>-native-debug-symbols.zip
```

The workflow first checks for that archive and then checks the AAB for embedded native symbol
metadata. A missing standalone ZIP does not fail the release when symbols are embedded in the AAB
or when a third-party dependency supplied only stripped binaries. Any standalone archive that is
available is committed with the Android release files and included in the downloadable workflow
artifact. Each archive belongs only to the exact build and `versionCode` that generated it.

## Manual Play Console upload

If Play Console does not automatically extract the symbols from a newly generated AAB and CI
produced a standalone archive:

1. Open **Test and release > App bundle explorer**.
2. Select the exact Vault Nest artifact and `versionCode`.
3. Open **Downloads** and locate the native debug symbols section.
4. Upload the matching
   `releases/vault-nest-release-<version>-native-debug-symbols.zip` archive.

Never upload symbols from another version. Symbols improve only future native crash and ANR reports
for the version to which they are attached. If CI reports that the prebuilt dependency supplied no
symbols, there is no valid archive to upload manually.

## Third-party limitations

Vault Nest receives SQLCipher as a prebuilt native AAR through `@capacitor-community/sqlite`. Some
third-party Android libraries publish native binaries that have already been stripped. Gradle
cannot recreate symbols removed before the dependency was published. CI reports that condition but
does not fail an otherwise valid APK/AAB build. Play may still lack detailed symbols for an
individual pre-stripped library, and only that library's publisher can provide the original
symbols. This limitation does not affect application execution.
