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

## CI artifact

The release build produces:

```text
android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

GitHub Actions requires that archive to be non-empty and copies it to:

```text
releases/vault-nest-release-<version>-native-debug-symbols.zip
```

The versioned archive is committed with the Android release files and included in the downloadable
workflow artifact. Each archive belongs only to the exact build and `versionCode` that generated
it.

## Manual Play Console upload

If Play Console does not automatically extract the symbols from a newly generated AAB:

1. Open **Test and release > App bundle explorer**.
2. Select the exact Vault Nest artifact and `versionCode`.
3. Open **Downloads** and locate the native debug symbols section.
4. Upload the matching
   `releases/vault-nest-release-<version>-native-debug-symbols.zip` archive.

Never upload symbols from another version. Symbols improve only future native crash and ANR reports
for the version to which they are attached.

## Third-party limitations

Some third-party Android libraries publish native binaries that have already been stripped. Gradle
cannot recreate symbols removed before the dependency was published. CI verifies that Vault Nest's
overall symbol archive exists, but Play may still lack detailed symbols for an individual
pre-stripped library. That limitation does not affect application execution.
