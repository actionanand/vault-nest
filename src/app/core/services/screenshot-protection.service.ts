import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import { DEFAULT_PREFERENCES } from '../models/vault.models';
import { StorageEngine } from '../storage/storage-engine';

interface NativeScreenshotBridge {
  setScreenshotProtection(enabled: boolean): void;
}

interface NativeScreenshotWindow extends Window {
  VaultNestNative?: NativeScreenshotBridge;
}

@Service()
export class ScreenshotProtectionService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StorageEngine);

  async initialise(): Promise<void> {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...((await this.storage.getPreferences()) ?? {}),
    };
    this.apply(preferences.screenshotProtection);
  }

  apply(enabled: boolean): void {
    try {
      (
        this.document.defaultView as NativeScreenshotWindow | null
      )?.VaultNestNative?.setScreenshotProtection(enabled);
    } catch {
      // Screenshot blocking is only available in the Android shell.
    }
  }
}
