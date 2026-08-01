# Android R8 and deobfuscation files

## What the Play Console warning means

Google Play can show this warning after an Android App Bundle is uploaded:

> There is no deobfuscation file associated with this App Bundle.

The warning does not prevent installation or release. It means Google Play did not find an R8 or
ProGuard mapping file for that version. Without the matching mapping, obfuscated Java or Kotlin
crash and ANR stack traces are harder to diagnose.

## Vault Nest release optimization

Vault Nest generates the `android/` project during GitHub Actions. After Capacitor synchronization,
`scripts/patch-android.mjs` changes the generated release configuration to enable:

```groovy
release {
    minifyEnabled true
    shrinkResources true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
}
```

- `minifyEnabled true` runs R8 to shrink, optimize, and obfuscate native bytecode.
- `shrinkResources true` removes Android resources that are no longer reachable after code
  shrinking.
- Obfuscation is not encryption and must not be treated as a security boundary.

Vault Nest exposes native Android methods to Angular using `WebView` JavaScript interfaces. Those
methods are resolved by name at runtime, so the patch adds this keep rule to
`android/app/proguard-rules.pro`:

```proguard
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
```

This prevents R8 from removing or renaming annotated bridge methods while allowing unrelated code
to be optimized.

### Google Tink annotation compatibility

Vault Nest uses Google Tink for cryptographic operations. Tink's bytecode references two
compile-time `javax.annotation` types that are not present in the Android runtime. R8 reports those
references during its whole-program analysis even though the annotations are not required while
the application runs. The native patch therefore adds only these two compatibility rules:

```proguard
-dontwarn javax.annotation.Nullable
-dontwarn javax.annotation.concurrent.GuardedBy
```

The rules are deliberately narrow. Vault Nest does not use a global `-ignorewarnings` rule, does
not suppress unrelated missing classes, and does not disable Tink optimization. A future missing
class will still fail CI and must be reviewed separately.

## Mapping-file generation and retention

Every optimized release generates a mapping at:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

The mapping is unique to the exact build and `versionCode`. Never use a mapping from another
release. The Android workflow requires this file to be non-empty and copies it to:

```text
releases/vault-nest-release-<version>-mapping.txt
```

For example, version `1.0.5` produces
`releases/vault-nest-release-1-0-5-mapping.txt`. CI commits it with the versioned APK and AAB on
`main-android` and includes it in the downloadable GitHub Actions artifact.

The AAB build normally embeds mapping metadata for Google Play to associate automatically. The
standalone copy is retained so the exact mapping remains available if it must be uploaded manually
or used with ReTrace later.

## CI safety checks

The Android workflow:

1. targets Android SDK 36;
2. generates and synchronizes the Capacitor Android project;
3. enables R8, resource shrinking, and WebView keep rules;
4. builds both the release APK and AAB;
5. fails if `mapping.txt` is missing or empty;
6. copies the version-specific mapping into `releases/`; and
7. lists the mapping in the emoji-labelled job summary.

## Play Console

Upload the newly generated AAB normally. If Play Console still does not associate a ReTrace
mapping automatically:

1. Open **Test and release > App bundle explorer**.
2. Select the exact Vault Nest version and `versionCode`.
3. Open **Downloads** and locate the deobfuscation or ReTrace mapping section.
4. Upload the matching `releases/vault-nest-release-<version>-mapping.txt` file.

Do not upload a mapping produced for a different version. A new build cannot recreate the exact
mapping for an older published binary.

## Security and storage

- `mapping.txt` contains Java/Kotlin symbol mappings, not the Android signing key, keystore
  password, master password, or vault records.
- Preserve each published mapping for as long as its application version is supported.
- Do not edit, merge, or regenerate a mapping after publishing the corresponding binary.
- If the repository is public and symbol names are considered sensitive, keep the standalone
  mapping only in a private CI artifact. The AAB can still supply mapping metadata to Google Play.
