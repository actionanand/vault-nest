# Development guide

## Package handoff

Codex does not install or build this project. Use the install commands in the README from WSL2. After installation, run lint, tests, and build locally and report diagnostics for the next iteration.

## Component conventions

Use standalone Angular components without an explicit `standalone` flag. Prefer signals and computed values, `input()`/`output()`, native template control flow, relative template/style paths, and small focused components. New icons belong in `AppIcon` and must come from `@lucide/angular`.

Do not use `any`, `ngClass`, `ngStyle`, `HostBinding`, `HostListener`, Local Storage, Session Storage, cookies, unsafe HTML, or console logging of application data.

## Accessibility review

- Keep targets at least 44×44 CSS pixels.
- Preserve visible focus styles and logical keyboard order.
- Label icon-only buttons with an accessible name.
- Announce copy/save/error feedback through `role=status` or `role=alert`.
- Do not use colour as the only status indicator.
- Test 200% zoom, Android font scaling, light/dark contrast, reduced motion, AXE, and screen readers.

## GitHub Pages deployment

The Pages workflow runs for pushes to `main-github` and can also be started with
**Run workflow**. It builds Angular with `/vault-nest/` as the base href, verifies
the generated `index.html` and SPA `404.html`, uploads
`dist/vault-nest/browser`, and deploys it through GitHub's native Pages action.

In the repository, open **Settings -> Pages** and set **Source** to
**GitHub Actions**. The workflow no longer publishes a `gh-pages` branch. A
successful deployment reports its URL through the protected `github-pages`
environment.

## Adding an item type

1. Extend `VaultItemType`.
2. Add editor defaults without introducing a second persistence path.
3. Map a Lucide icon in shared UI.
4. Add navigation/filter text.
5. Test encryption round trips, list redaction, editing, archive/trash, search exclusions, and backup compatibility.

## Security review triggers

Changes to key derivation, envelope formats, native secure storage, backup, attachments, OTP, clipboard, logging, WebView configuration, or export behavior require focused threat-model review and tests.
