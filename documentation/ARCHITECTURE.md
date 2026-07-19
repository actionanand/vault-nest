# Architecture

## Boundaries

The UI never calls IndexedDB or SQLite. Components communicate with signal-based stores and focused services. Stores depend on the abstract `StorageEngine`, selected at runtime by `provideStorageEngine()`.

```text
Angular feature component
        ↓
Signal store / domain service
        ↓
StorageEngine abstraction
        ↓
IndexedDbStorage (browser) | SqliteStorage (Android)
```

`VaultCryptoService` sits between decrypted domain objects and persisted records. Storage adapters receive encrypted item payloads plus only the minimum metadata needed for indexed filtering: ID, item type, favourite/archive/deletion flags, expiry, and timestamps.

## Feature layout

- `core/crypto`: key derivation, wrapping, authenticated encryption.
- `core/models`: domain contracts and encrypted storage contracts.
- `core/storage`: shared port and platform adapters.
- `core/services`: authentication, vault state, themes, password generation.
- `core/guards`: first-run, locked, and unlocked route boundaries.
- `features`: lazy-loaded user workflows.
- `shared/components`: small reusable visual components, including Lucide icons.

## Runtime lifecycle

1. App startup opens the platform database and reads the vault header.
2. A missing header routes to setup. An existing header routes to unlock.
3. Setup creates a random 256-bit vault key. The master password derives only a wrapping key.
4. Unlock unwraps the vault key into memory and decrypts records on demand.
5. Lock removes the key reference and decrypted store state, then returns to the lock screen.
6. Inactivity and background transitions apply the stored locking preferences.

## State rules

Signals own local state. Computed signals derive selection, filters, favourites, strength, and entropy. Updates use immutable `set`/`update` operations. Decrypted vault items are cleared when locking; they are never logged.

## Responsive shell

Desktop uses a persistent navigation pane, item list, and details pane. Mobile uses a sliding drawer, bottom navigation, single-column list, and a touch-sized floating add menu. Reusable item cards and secret-field actions keep interaction logic out of the page component.
