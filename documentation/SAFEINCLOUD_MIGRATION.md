# SafeInCloud database migration

Vault Nest includes a local converter for encrypted `SafeInCloud.db` files. It never writes decrypted XML or plaintext credentials to disk. The only output is a passphrase-encrypted Vault Nest `.vaultpack`.

## Requirements

- The original SafeInCloud master password is required. SafeInCloud encrypts the complete database and cannot recover a forgotten password.
- Choose a new Vault Nest master password with at least 12 characters, uppercase, lowercase, a number, and a symbol.
- Choose a backup passphrase of at least eight characters. This protects the generated `.vaultpack` during transfer and restoration.

Do not pass any password on the command line. The converter prompts for secrets with terminal echo disabled, keeping them out of shell history.

## Convert

From WSL2:

```bash
npm run migrate:safeincloud -- \
  --input "/mnt/c/Users/meeta/Downloads/SafeInCloud.db" \
  --output "/mnt/c/Users/meeta/Downloads/SafeInCloud-vault-nest.vaultpack"
```

From PowerShell:

```powershell
npm run migrate:safeincloud -- `
  --input "C:\Users\meeta\Downloads\SafeInCloud.db" `
  --output "C:\Users\meeta\Downloads\SafeInCloud-vault-nest.vaultpack"
```

The command reports counts only. It does not print titles, usernames, passwords, field values, notes, or backup codes.

## Restore

1. Open Vault Nest and unlock the existing local vault.
2. Go to **Settings → Data → Restore encrypted backup**.
3. Select `SafeInCloud-vault-nest.vaultpack`.
4. Enter the VaultPack backup passphrase chosen during conversion.
5. Confirm that the existing Vault Nest database may be replaced.
6. After reload, unlock with the new Vault Nest master password chosen during conversion.

Restoration replaces the current Vault Nest database. Create an encrypted Vault Nest backup first if it already contains records that must be retained.

## Mapping

- SafeInCloud cards become Vault Nest credentials.
- Login, password, website, email, phone, number, date, expiry, PIN, OTP, secret, and multiline fields are mapped to their closest Vault Nest field types.
- Passwords, PINs, OTPs, secrets, CVV/CVC values, recovery codes, and similarly named fields remain hidden by default.
- A field named Notes becomes the Vault Nest item notes.
- Recovery/backup-code fields become the dedicated 2FA backup-codes area.
- Stars become favourites.
- SafeInCloud templates remain templates.
- Labels are retained when their card relationship is present in the XML.
- Deleted cards and sync tombstones are not imported.
- Embedded attachments are preserved as sensitive hidden Base64 fields because Vault Nest does not yet have a binary-attachment model.
- Website artwork is not copied from the encrypted database. Android can fetch and cache the first website icon after restoration.

## Cryptographic formats

The converter supports the SafeInCloud container identified by magic `0x0505`: PBKDF2-SHA1 with 10,000 iterations, an AES-256-CBC-wrapped inner key, AES-256-CBC database encryption, and zlib-compressed XML. This compatibility code follows the independently documented format in [`mxschmitt/golang-safe-in-cloud`](https://github.com/mxschmitt/golang-safe-in-cloud).

The output uses Vault Nest’s current compact backup format:

- a random 256-bit vault key;
- PBKDF2-SHA256 with 600,000 iterations for the Vault Nest master password;
- AES-256-GCM with authenticated context for the wrapped vault key;
- gzip-compressed Vault Nest items;
- PBKDF2-SHA256 with 600,000 iterations and AES-256-GCM for the outer `.vaultpack`.

The old SafeInCloud password, new Vault Nest master password, backup passphrase, and plaintext XML are held only in process memory. Node and the operating system may still retain memory pages temporarily; run the migration on a trusted device.

## Convert back to SafeInCloud

Vault Nest can also convert a current compact `.vaultpack` into an encrypted
SafeInCloud-compatible `.db` container. This is a compatibility workaround for leaving Vault
Nest; no plaintext CSV or XML intermediate file is written.

Create a fresh encrypted backup in Vault Nest first. Then run:

```bash
npm run migrate:to-safeincloud -- \
  --input "/mnt/c/Users/meeta/Downloads/vault-nest-backup.vaultpack" \
  --output "/mnt/c/Users/meeta/Downloads/VaultNest-SafeInCloud.db"
```

The command asks for the VaultPack backup passphrase and a new password for the generated
SafeInCloud database. Passwords are hidden and are never accepted as command-line arguments.

Before importing or replacing any SafeInCloud database:

1. Back up the existing SafeInCloud database.
2. Test the generated file with an empty or separate SafeInCloud database first.
3. Confirm several cards, custom fields, labels, notes, passwords, and 2FA backup codes before
   relying on the converted database.

The converter exports all non-trashed Vault Nest items. Archived items receive a
`Vault Nest Archived` label because SafeInCloud has no equivalent archive state. Vault Nest
templates and favourites are retained. Item icons are not embedded because the two applications
use different icon models.

This route is based on SafeInCloud's independently documented native container format rather than
an official SafeInCloud writer API. If a particular SafeInCloud release rejects the `.db`, use
Vault Nest's **Settings → Data → Export as CSV** and SafeInCloud's desktop import flow instead.
CSV is plaintext, so securely delete it immediately after import.
