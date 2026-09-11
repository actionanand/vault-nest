# Vault Nest for Wear OS

Vault Nest Wear is a standalone, native Kotlin password vault under `wear/`. It works without a
phone, account, internet connection, or cloud service. A user can create a Watch PIN, generate a
password, store it with a preset label, reveal or copy it, and delete it entirely on the watch.

The Android app remains an optional companion. It can synchronize a small user-selected set of
credentials over the Wearable Data Layer, but a missing or disconnected phone never blocks the
watch-only workflow.

## First launch and local workflow

1. Launch Vault Nest on the watch.
2. Choose **Set up on this watch**.
3. Create and confirm a 4–6 digit Watch PIN.
4. Choose **Generate password**, preview or regenerate the 20-character password, select a label,
   and choose **Save on watch**.
5. Open the saved entry to reveal it for ten seconds, copy it, or delete it after confirmation.

**Connect Android phone** is a secondary first-launch option. Its screen always retains a
**Set up on this watch** action, so failed pairing cannot strand the user or a Play reviewer.

## Entry limits and ownership

Both capacities are configured in `src/environments/watch-vault.environment.ts`:

- `WATCH_VAULT_MAX_ENTRIES` limits credentials synchronized from the phone; default `5`.
- `WATCH_VAULT_MAX_LOCAL_ENTRIES` limits passwords created on the watch; default `5`.

Wear records carry an origin of `PHONE` or `WATCH`. Records written by older releases have no
origin and migrate to `PHONE`. A phone synchronization replaces only `PHONE` records. Phone-side
**Clear Watch Vault** clears only synchronized records. Watch-created records never leave the watch
and only local deletion or **Erase Watch Vault** can remove them.

## Optional phone synchronization

1. In the Android app, open **Settings → Wear OS** and enable integration.
2. Open a credential containing a password and choose **Send to Watch**.
3. Manage the phone-selected set in **Watch Vault** or **Sent watch credentials**.

Phone and Wear use application ID `com.actionanand.vaultnest.app` and the same signing identity,
which the Wearable Data Layer requires. Transport payloads are additionally encrypted. Sync is
optional and the Wear manifest declares `com.google.android.wearable.standalone=true`.

## Build, version, and artifacts

The independent `.github/workflows/build-wear.yml` workflow runs for `main-wear` and by manual
dispatch. It reads the Android semantic base from `android-version.json` and Wear revision/code
from `wear-version.json`. For example, Android `1.0.19` and Wear revision `1` produce
`1.0.19-wear.1`. CI increments only the Wear `versionCode` on `main-wear`; the next build after
rejected code `2008` is `2009`.

The workflow validates Play-quality contracts, runs unit tests, builds debug/release APKs and a
release AAB, verifies signatures, and writes only to `releases/wear/`. Android and Wear workflows
do not delete or stage each other's artifacts.

Required repository secrets are `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and
`KEY_PASSWORD`.

## Play quality contract

- All screens use a `ScalingLazyColumn` and visible `PositionIndicator` (`WO-V8`).
- Activity, Compose, launcher, and splash surfaces are true black (`WO-V13`).
- AndroidX SplashScreen displays the 48dp Vault Nest mark (`WO-V15`).
- Controls are at least 48dp, text remains readable, and round-screen padding is shared.
- Credential details support swipe-to-dismiss and a visible Back action.
- PIN hashing and vault file access run off the UI thread; operational failures are recoverable.
- The full core workflow works with the phone unavailable (`WO-P5`).

Before release, manually validate first launch, PIN setup/unlock, generation, persistence across an
app restart, reveal/copy/delete, scrolling, and temporary phone loss on 192dp and 227dp round Wear
OS 3+ devices, including large fonts.

## Play submission

Replace rejected Wear version `2008` on every active internal, closed, open, and production track.
Do not leave the rejected artifact active on another track. Suggested listing text:

> Vault Nest works independently on your Wear OS watch. Create a Watch PIN, generate and securely
> store passwords locally, or optionally synchronize selected credentials from the Vault Nest
> Android app.

Give reviewers this exact path: launch → **Set up on this watch** → create PIN →
**Generate password** → save → open → reveal/copy → delete.

Official references: [Wear OS app quality](https://developer.android.com/docs/quality-guidelines/wear-app-quality),
[Wear scrolling surfaces](https://developer.android.com/design/ui/wear/guides/surfaces/apps), and
[standalone Wear apps](https://developer.android.com/training/wearables/apps/standalone-apps).

## Limitations

- Local creation intentionally generates passwords with preset labels; it is not a full arbitrary
  username/password editor.
- Version 1 phone sync is user initiated and does not poll in a permanent background service.
- Clipboard clearing is best effort across Wear OS versions; viewing is the preferred recovery path.
