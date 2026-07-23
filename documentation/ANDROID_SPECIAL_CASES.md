# Android splash and credential notification special cases

This guide documents the two Android flows that cannot be implemented reliably only inside the Angular WebView: the cold-start splash screen and locked-vault credential notification copying.

## Branded splash screen

Android 12 and newer draw a system launch window before `MainActivity.onCreate`. JavaScript, Angular components, Capacitor plugin calls, and the WebView are not available during that stage.

Vault Nest therefore applies branding in three layers:

1. `AndroidManifest.xml` pins `MainActivity` to `AppTheme.NoActionBarLaunch`.
2. The launch theme inherits from `Theme.SplashScreen`, sets the dark `#111B21` background, uses `vault_nest_splash_icon`, and declares `AppTheme.NoActionBar` as the post-splash theme.
3. `MainActivity` briefly displays the same transparent brand image while Angular performs its initial render. Angular calls `VaultNestNative.hideSplash()` after the first render.

`public/vault-nest.png` is the canonical source. CI places a transparent copy in `drawable-nodpi`; the splash drawable uses an inset with no icon background color. Do not add a white shape, tile, or opaque canvas around this image. Android already controls the system splash icon mask and safe area.

When changing the splash implementation, verify:

- A cold launch after force-stopping the app.
- Android 12+ system splash and an older supported Android version.
- Light, dark, and automatic app themes.
- Portrait and landscape.
- No white square, white flash, stretched image, or clipped brand mark.

## Send to notifications

The Android-only action creates one native notification per populated username, email, or password field. The copy window is three minutes and intentionally remains available after the vault is locked.

### Why a no-display activity is used

Some Android and OEM builds restrict or cache clipboard writes made by background broadcast receivers. The first notification can appear to work while later notification taps continue pasting the first value.

Each Vault Nest notification therefore has a unique immutable `PendingIntent` targeting a non-exported, no-display activity. A notification tap is a direct user action, so Android gives that activity foreground clipboard authority. It performs one `setPrimaryClip` call for the selected value, marks the clip sensitive, displays a short confirmation, and immediately finishes without opening the Vault Nest interface.

### Temporary value storage

Notification text and pending intents contain only an ephemeral numeric ID. Username, email, and password values are:

- AES-GCM encrypted with a non-exportable Android Keystore key.
- Stored in app-private preferences only for the copy window.
- Resolved by ID after each notification tap.
- Rejected and deleted after expiry.
- Deleted immediately when notifications are explicitly cleared, the vault database is cleared, or the account is removed.

The clipboard is separately overwritten after five minutes on a best-effort basis. Android may terminate the process before a delayed handler runs, so users retain the **Clear clipboard now** action.

### Verification matrix

Test all of these on a physical Android device:

1. Send a password and email to notifications.
2. Lock Vault Nest and switch to a different application.
3. Copy password, paste it, then copy email and paste it without reopening Vault Nest.
4. Repeat in the opposite order.
5. Confirm Vault Nest never replaces the other application on screen.
6. Confirm an expired notification cannot copy.
7. Confirm clearing/removing the vault invalidates all notification shortcuts.

Never put plaintext credential values into notification titles, bodies, action labels, log output, analytics, intent URIs, or pending-intent extras.

## Credential expiry reminders

Expiry reminders are Android-only native scheduled notifications. Saving an active credential with
an expiry date schedules one reminder for 9:00 AM local time three days before expiry. If the
credential expires within the next three days, Android schedules the reminder shortly after the
item is saved. Dates are interpreted in the device's local timezone.

Vault Nest asks for Android notification permission when the user first saves an item that needs a
reminder, or after unlock when an existing future expiry needs scheduling. When permission is
denied, the credential and expiry date remain saved, but the reminder is not scheduled.

Each credential uses a stable notification ID. Editing the expiry replaces the prior schedule.
Removing the expiry, archiving, trashing, permanently deleting, clearing the database, or removing
the account cancels its pending reminder. Unlocking the vault reconciles active credential expiry
dates with Android's pending notifications, which also restores schedules after a backup is
restored and the app reloads.

The notification contains the credential title and expiry date so the user can identify the item.
It never contains field values, usernames, passwords, PINs, secrets, notes, or 2FA backup codes.
Delivery time is controlled by Android and may be delayed by device battery optimisation.

## Theme-aware option pickers

Android's native HTML `select` overlay is rendered by the device or WebView and can remain light even when Vault Nest is dark. Field-type selection therefore uses the reusable Angular `SelectPicker` instead of a native `select`. On phones it opens as a bottom sheet; on larger screens it opens as a centred dialog. Both surfaces use Vault Nest theme variables, so Light, Dark, and Automatic modes remain consistent without relying on OEM dropdown styling.
