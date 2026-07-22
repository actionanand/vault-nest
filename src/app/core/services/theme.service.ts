import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';
import type { AppTheme } from '../models/vault.models';
import { DEFAULT_PREFERENCES } from '../models/vault.models';
import { StorageEngine } from '../storage/storage-engine';

interface SystemBarsBridge {
  setDarkMode(enabled: boolean): void;
}

interface NativeThemeWindow extends Window {
  VaultNestSystemBars?: SystemBarsBridge;
}

@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StorageEngine);
  private readonly systemTheme = this.document.defaultView?.matchMedia(
    '(prefers-color-scheme: dark)',
  );
  readonly theme = signal<AppTheme>('AUTOMATIC');
  readonly resolvedDark = signal(false);
  constructor() {
    this.systemTheme?.addEventListener('change', () => {
      if (this.theme() === 'AUTOMATIC') this.syncResolvedTheme();
    });
  }
  async initialise(): Promise<void> {
    this.apply((await this.storage.getPreferences())?.theme ?? 'AUTOMATIC');
  }
  async setTheme(theme: AppTheme): Promise<void> {
    this.apply(theme);
    const current = (await this.storage.getPreferences()) ?? DEFAULT_PREFERENCES;
    await this.storage.savePreferences({ ...current, theme });
  }
  private apply(theme: AppTheme): void {
    this.theme.set(theme);
    if (theme === 'AUTOMATIC') delete this.document.documentElement.dataset['theme'];
    else this.document.documentElement.dataset['theme'] = theme;
    this.syncResolvedTheme();
  }
  private syncResolvedTheme(): void {
    const dark =
      this.theme() === 'DARK' ||
      (this.theme() === 'AUTOMATIC' && Boolean(this.systemTheme?.matches));
    this.resolvedDark.set(dark);
    const color = dark ? '#0e1713' : '#f4f6f4';
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    try {
      (this.document.defaultView as NativeThemeWindow | null)?.VaultNestSystemBars?.setDarkMode(
        dark,
      );
    } catch {
      // The browser build and older Android shells do not expose the native bridge.
    }
  }
}
