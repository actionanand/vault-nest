# Password generator

Vault Nest generates passwords locally with the Web Crypto API. Generated values are never sent to
a server or stored automatically.

## Modes

### Random

Random mode builds a character pool from the enabled lowercase, uppercase, number, and symbol
groups. At least one character from every enabled group is included before the result is securely
shuffled. The length can be set from 8 to 64 characters.

When special characters are enabled, the **Allowed special characters** field is authoritative.
Only unique printable ASCII punctuation entered in that field can occur in the generated password;
letters, numbers, whitespace, emoji, and duplicate characters are ignored.

### Memorable

Memorable mode creates a securely selected stream of English words. It does not use quotations or
grammatical sentences that may be easier to predict. Users choose an exact length from 12 to 64
characters, capitalization, an optional two-digit ending, and a one-character punctuation connector.
The connector defaults to `-`, is included in the requested length, and is selected from the
connector key dialog.

Optional memorable substitutions introduce randomly selected leetspeak-style variants. The curated
mapping includes alternatives such as `a → @/^`, `b → 8/13/l3`, `c → (`, `d → 1)/l)`, `e → 3`, and
`f → 1=/l=/|=`, plus variants for the remaining alphabet. Only one to three eligible positions are
replaced across the complete password, keeping the English structure recognizable. Replacements
that conflict with **Avoid ambiguous characters** are excluded. The final result still uses the exact
requested character length, and enabling capitalization guarantees that at least one uppercase letter
survives substitution and length fitting.

The optional **English contractions** setting guarantees that the phrase includes a securely selected
contraction, such as `I'm`, `I'll`, `we're`, or `can't`. The generator returns the underlying English
words separately so the UI can display a readable guide without changing the copied password.

## Randomness and strength

All selections use `crypto.getRandomValues`. Rejection sampling avoids modulo bias when mapping a
random 32-bit value to a character or word-list index.

Random-mode entropy is estimated from password length and the enabled character pool. Memorable
mode uses the actual number of possible adjective/noun combinations, numeric endings, and separator
choices. The estimate is descriptive and is not a guarantee against every attack method.

## Clipboard

The Copy action uses the shared `ClipboardService`. On Android and supported browser contexts, Vault
Nest overwrites the clipboard after five minutes using the same policy as copied vault fields.

## Relevant files

- `src/app/core/services/password-generator.service.ts`
- `src/app/features/generator/generator.ts`
- `src/app/features/generator/generator.html`
- `src/app/features/generator/generator.scss`
