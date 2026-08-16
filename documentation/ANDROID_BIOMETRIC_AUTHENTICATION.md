# Android biometric authentication

This document explains how biometric unlock works in Vault Nest, why face recognition is not
available on some Android tablets, and why a face that unlocks the device or another application
may still be unavailable to Vault Nest.

## Summary

Vault Nest accepts Android **Class 3 (strong)** biometric authentication. Android chooses the
eligible enrolled modality, so the same implementation supports a Class 3 fingerprint, face, or
iris sensor. Vault Nest does not select fingerprint or face itself and never receives biometric
images, templates, or matching data.

Many tablets provide convenient two-dimensional face unlock through the front camera. Android may
classify this as **Class 2 (weak)** rather than Class 3. It can unlock the screen and applications
that accept weak biometrics, but it cannot authorize the cryptographic operation used by Vault Nest.
In that situation, the disabled biometric setting is expected security behaviour rather than a
camera-permission, face-enrolment, or user-interface failure.

## Android biometric classes

Android classifies biometric implementations by their security properties instead of treating all
face and fingerprint implementations as equivalent.

| Android authenticator | Meaning                                              | Vault Nest                                                                                  |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `BIOMETRIC_STRONG`    | A Class 3 fingerprint, face, or iris implementation  | Supported                                                                                   |
| `BIOMETRIC_WEAK`      | Any Class 2 biometric, including Class 3 as a subset | Not accepted for vault-key unwrapping                                                       |
| `DEVICE_CREDENTIAL`   | The Android screen-lock PIN, pattern, or password    | Not currently used by biometric unlock; the Vault Nest master password remains the fallback |

The modality name is not enough to determine its class. A face implementation backed by suitable
depth, infrared, liveness, and anti-spoofing hardware may qualify as Class 3. A conventional front
camera face unlock commonly does not. The device manufacturer and Android framework determine the
classification; Vault Nest cannot promote a weak sensor to a strong one.

Android reference:

- [Biometric authenticator classes](https://developer.android.com/reference/androidx/biometric/BiometricManager.Authenticators)
- [Biometric authentication guide](https://developer.android.com/identity/sign-in/biometric-auth)
- [Android Keystore user-authentication requirements](<https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setUserAuthenticationParameters(long,int)>)

## Why face unlock can work elsewhere

A tablet can successfully use face recognition in several places while Vault Nest correctly keeps
biometric unlock disabled:

1. Device screen unlock is controlled by the manufacturer and may permit its convenient face
   implementation.
2. Some applications request `BIOMETRIC_WEAK`, or use authentication only as an application-level
   gate without binding a cryptographic key to the result.
3. Vault Nest requests `BIOMETRIC_STRONG` and supplies an authenticated cryptographic object to the
   system prompt. The successful authentication must authorize the Keystore operation itself.

Consequently, “face unlock works in other applications” shows that face data is enrolled, but it
does not show that the face sensor satisfies Android Class 3 or can authorize a Keystore key.

## Vault Nest biometric flow

Biometric unlock is an Android-only convenience mechanism. The master password remains the durable
fallback and is not replaced by a fingerprint or face.

### Availability

The generated Android bridge evaluates:

```java
BiometricManager.from(activity).canAuthenticate(
  BiometricManager.Authenticators.BIOMETRIC_STRONG
)
```

Vault Nest enables the setting only when Android returns `BIOMETRIC_SUCCESS`. The check asks for an
eligible strong authenticator, not merely whether the device has a camera, enrolled face, or some
form of screen unlock.

### Enabling biometric unlock

After the owner authenticates with the full master password, Vault Nest:

1. generates a non-exportable AES key inside Android Keystore;
2. configures that key for authentication on every use with `AUTH_BIOMETRIC_STRONG`;
3. asks Android to present its system biometric prompt;
4. wraps the random Vault Nest vault key with AES-GCM; and
5. stores only the wrapped vault key and its encryption metadata.

The raw vault key is not stored as a biometric preference. Vault Nest cannot read the owner's
fingerprint, face image, face template, or the manufacturer's biometric database.

### Unlocking

During biometric unlock, Vault Nest loads the wrapped vault key and prepares an Android Keystore
decryption operation. It passes that operation to `BiometricPrompt` as a `CryptoObject`. A successful
Class 3 biometric prompt authorizes the operation, after which the unwrapped vault key can decrypt
the local vault. Cancelling or failing the system prompt does not expose the vault key.

Changing enrolled biometrics invalidates the Vault Nest biometric key. The owner must then unlock
with the full master password and enable biometric unlock again. Removing the account or disabling
biometric unlock deletes its native key and wrapped material.

## Why Vault Nest does not accept weak face unlock

Changing only the availability check or prompt from `BIOMETRIC_STRONG` to `BIOMETRIC_WEAK` would not
be a valid fix. The current design uses a `CryptoObject` and a Keystore key whose authorization is
bound to strong biometric authentication. A weak face match cannot authorize that key.

Supporting weak face unlock would require a different and weaker design in which the face prompt is
only a user-interface gate and the cryptographic key is not protected by the same per-use strong
authentication. This would reduce protection against spoofing and device compromise, which is not
appropriate as the default for a password manager.

Vault Nest also must not implement its own camera-based face matching. A custom implementation
would need to store or derive sensitive biometric data, provide liveness and anti-spoofing controls,
and handle substantial privacy risk. It still would not turn the camera into an Android
Keystore-authorized Class 3 sensor. The optional intrusion-evidence camera feature is unrelated to
authentication and must never be reused for this purpose.

## Expected behaviour by device

| Device state                                         | Expected result                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Enrolled Class 3 face, fingerprint, or iris          | Biometric setting is enabled and Android presents the eligible system modality |
| Enrolled Class 2 face only                           | Biometric setting remains disabled                                             |
| Strong sensor exists but nothing is enrolled         | Biometric setting remains disabled until a strong biometric is enrolled        |
| Strong biometric hardware is temporarily unavailable | Availability can remain disabled until Android reports it ready                |
| Browser or installed web application                 | Biometric setting is unavailable because the native Android bridge is absent   |
| Biometric enrolment changes after setup              | Stored biometric key is invalidated; use the master password and enrol again   |

## Troubleshooting checklist

1. Confirm that the application is the native Android build, not the browser or GitHub Pages build.
2. Enrol the biometric under the device's Android security settings.
3. Close and reopen Vault Nest so it refreshes native availability.
4. Do not infer Class 3 support solely from successful screen unlock or another app's face prompt.
5. Install the same Vault Nest build on a device with an enrolled strong fingerprint or strong face
   sensor to distinguish application configuration from device capability.
6. Retain the full master password. It is required when biometric enrolment changes, the Keystore
   key is invalidated, or no eligible strong biometric is available.

Android does not provide a universal Settings label that reliably tells an owner whether a face
implementation is Class 2 or Class 3. The result returned by `canAuthenticate(BIOMETRIC_STRONG)` on
the actual device and operating-system build is the authoritative runtime answer for Vault Nest.

## Project implementation references

- `scripts/patch-android.mjs` generates the AndroidX biometric availability check, system prompt,
  AES-GCM wrapping flow, and Android Keystore key policy.
- `src/app/core/services/biometric.service.ts` exposes the native bridge to Angular and keeps the
  biometric availability state.
- `documentation/SECURITY.md` describes biometric unlock within the wider Vault Nest threat model.

No separate fingerprint or face toggle is necessary. The user-facing feature should remain named
**Biometric unlock**, because Android selects any enrolled modality that satisfies the requested
strong authenticator class.
