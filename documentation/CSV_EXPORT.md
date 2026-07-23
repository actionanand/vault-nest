# Plaintext CSV export

Vault Nest can export active and archived credentials from **Settings → Data → Export as CSV**. The feature is intended for moving data to another password manager.

## Security warning

CSV is deliberately unencrypted for interoperability. The confirmation dialog requires explicit acknowledgement before export because the file contains readable passwords, PINs, secrets, one-time passwords, backup codes, notes, and custom fields. Anyone or any application that can access the file can read those values.

Move the CSV directly to the destination password manager, verify the import, and securely delete every remaining copy. Do not email it, keep it in a shared cloud folder, or treat it as a backup. Use the encrypted `.vaultpack` backup for normal Vault Nest backup and restore.

Trashed items and reusable templates are excluded. Active and archived credentials are included, and the `archived` column preserves their state.

## CSV schema

The file is UTF-8 with a byte-order mark for spreadsheet compatibility, uses CRLF line endings, and follows standard CSV quoting rules.

| Column                                              | Meaning                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `title`                                             | Credential title                                                                         |
| `category`                                          | Vault Nest item type                                                                     |
| `username`, `password`, `website`, `email`, `phone` | First field of each common type                                                          |
| `one_time_password`                                 | First OTP/2FA field                                                                      |
| `notes`                                             | Item notes                                                                               |
| `backup_codes`                                      | Optional 2FA recovery codes                                                              |
| `labels`                                            | Comma-separated labels                                                                   |
| `favourite`, `archived`                             | Boolean state                                                                            |
| `all_fields_json`                                   | Lossless JSON array containing every custom field, its type, value, and sensitivity flag |

Every CSV cell is quoted, and embedded quotes are doubled. Newlines and commas inside values therefore remain valid CSV content.

## Android saving

Android export uses the native Storage Access Framework with `ACTION_CREATE_DOCUMENT` and MIME type `text/csv`. The system document picker lets the user choose the destination and grants Vault Nest access only to that selected file. This avoids fragile browser downloads and does not require broad storage permission.

The native bridge receives UTF-8 CSV bytes as Base64, opens the Android document picker, writes through `ContentResolver`, then reports success or cancellation to Angular. The bridge is generated during CI by `scripts/patch-android.mjs`.

## Browser saving

On the web, Vault Nest creates a `text/csv;charset=utf-8` file in memory and triggers the browser download flow. The object URL is revoked immediately after the download starts.
