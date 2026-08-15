# Watch Vault security model

## Assets and threat model

Watch Vault protects a deliberately small offline copy of selected usernames and passwords against
casual access, lost-device browsing, database extraction, message tampering, and brute-force attempts
against the in-app PIN. It does not claim to withstand a fully compromised unlocked phone/watch OS,
root access with live Keystore use, screen observation while a password is revealed, or clipboard
collection by a compromised device.

## Transport and trust

Phone/watch messages use Google Play Services Wearable Data Layer, which is scoped to applications
signed/associated through the paired Android environment. Vault Nest adds application-layer
encryption:

- each device creates a P-256 ECDH key pair;
- private pairing keys are AES-GCM wrapped by non-exportable Android Keystore AES keys;
- public keys are exchanged only over the paired Data Layer and pinned by node ID;
- the watch refuses initial pairing until its local PIN setup is complete;
- ECDH output and ordered public keys are hashed with SHA-256 to derive a 256-bit transport key;
- sync and clear payloads use AES-256-GCM with the protocol path/version as authenticated data;
- unsupported versions, bad tags, corrupted ciphertext, duplicate IDs, and oversized payloads are
  rejected.

The phone's main vault key and master password are never sent to or copied onto the watch.

## Watch storage and PIN

The synchronized JSON file is encrypted with AES-GCM using a watch-only, non-exportable Android
Keystore key. It is atomically replaced after complete validation. The Wear app has no INTERNET
permission and no cloud dependency.

The Watch PIN is 4–6 digits. It is not stored. Verification uses PBKDF2-HMAC-SHA256 with a random
128-bit salt, 210,000 iterations, a 256-bit result, and constant-time comparison. Five failed attempts
start a 30-second delay; additional failures progressively increase the delay up to one hour. The app
does not wipe after a small number of mistakes.

The PIN is an application access gate; encrypted storage is independently protected by Android
Keystore and the device lock. It is not accurate to claim that the short PIN alone provides 256-bit
security.

## Visibility, clipboard, and lifecycle

- `FLAG_SECURE` blocks normal screenshots and recent-app previews.
- Passwords are hidden by default and automatically hidden after ten seconds.
- Leaving the app locks it immediately and discards reveal state.
- Clipboard content is marked sensitive where Wear OS supports it. Clipboard clearing is best effort,
  so users should prefer viewing and clear the clipboard through the OS when required.
- Code never logs plaintext credentials, payloads, encryption keys, or PINs.

## Lost devices and reset

If the watch is lost, use the phone's **Clear Watch Vault** while it is still reachable, and revoke or
wipe the watch through the device-management controls. A disconnected lost watch retains its encrypted
offline vault; changing the original phone password does not remotely erase it.

If the phone is lost, the watch remains usable with its Watch PIN. Reset the watch vault before pairing
to a replacement phone.

Local **Erase Watch Vault** deletes records, PIN state, pinned phone keys, wrapped ECDH material, and
watch Keystore aliases. Phone-side **Reset phone-side trust** removes pinned watch keys and phone
pairing material. A complete reset should be performed on both devices.
