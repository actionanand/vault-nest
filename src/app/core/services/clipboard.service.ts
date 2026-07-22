import { Clipboard } from '@capacitor/clipboard';
import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';

const CLIPBOARD_CLEAR_MS = 5 * 60_000;

interface NativeClipboardBridge {
  scheduleClipboardClear(delayMs: number): void;
}

interface NativeClipboardWindow extends Window {
  VaultNestNative?: NativeClipboardBridge;
}

@Service()
export class ClipboardService {
  private readonly document = inject(DOCUMENT);
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  readonly lastMessage = signal<string | null>(null);

  async copy(value: string, label = 'Value'): Promise<void> {
    await Clipboard.write({ string: value });
    this.scheduleClear();
    this.showMessage(`${label} copied. Clipboard clears in 5 minutes.`);
  }

  async clear(): Promise<void> {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    await Clipboard.write({ string: '' });
    this.showMessage('Clipboard cleared');
  }

  private scheduleClear(): void {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.clearTimer = null;
      void Clipboard.write({ string: '' });
    }, CLIPBOARD_CLEAR_MS);
    try {
      (
        this.document.defaultView as NativeClipboardWindow | null
      )?.VaultNestNative?.scheduleClipboardClear(CLIPBOARD_CLEAR_MS);
    } catch {
      // Native clipboard clearing is only available in the Android shell.
    }
  }

  private showMessage(message: string): void {
    this.lastMessage.set(message);
    setTimeout(() => {
      if (this.lastMessage() === message) this.lastMessage.set(null);
    }, 2600);
  }
}
