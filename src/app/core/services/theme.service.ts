import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';
import type { AppTheme } from '../models/vault.models';
import { DEFAULT_PREFERENCES } from '../models/vault.models';
import { StorageEngine } from '../storage/storage-engine';

@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StorageEngine);
  readonly theme = signal<AppTheme>('AUTOMATIC');
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
  }
}
