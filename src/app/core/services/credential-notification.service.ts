import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';
import type { VaultField, VaultItem } from '../models/vault.models';
import { ClipboardService } from './clipboard.service';
import { ThemeService } from './theme.service';

const COPY_ACTION_TYPE = 'vault-nest-copy-credential';
const CHANNEL_ID = 'vault-nest-credential-copy';
const COPY_WINDOW_MS = 3 * 60_000;
const NOTIFIABLE_TYPES: ReadonlySet<VaultField['type']> = new Set([
  'PASSWORD',
  'USERNAME',
  'EMAIL',
]);

interface NativeCredentialNotificationBridge {
  cancelCredentialNotifications(csvIds: string, delayMs: number): void;
}

interface NativeCredentialNotificationWindow extends Window {
  VaultNestNative?: NativeCredentialNotificationBridge;
}

interface CopyShortcut {
  readonly value: string;
  readonly label: string;
  readonly expiresAt: number;
}

@Service()
export class CredentialNotificationService {
  private readonly document = inject(DOCUMENT);
  private readonly clipboard = inject(ClipboardService);
  private readonly theme = inject(ThemeService);
  private initialised = false;
  private readonly shortcuts = new Map<number, CopyShortcut>();
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  readonly lastMessage = signal<string | null>(null);

  isAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  async initialise(): Promise<void> {
    if (!this.isAndroid() || this.initialised) return;
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Credential copy shortcuts',
        description: 'Temporary shortcuts for copying selected credential fields',
        importance: 4,
        visibility: 0,
        lights: false,
        vibration: false,
      });
      await LocalNotifications.registerActionTypes({
        types: [{ id: COPY_ACTION_TYPE, actions: [{ id: 'copy', title: 'Copy' }] }],
      });
      await LocalNotifications.addListener('localNotificationActionPerformed', async (event) => {
        const extra = event.notification.extra as Record<string, unknown> | undefined;
        if (extra?.['source'] !== 'vault-nest-copy') return;
        const copyId = extra?.['copyId'];
        if (typeof copyId !== 'number') return;
        const shortcut = this.shortcuts.get(copyId);
        if (!shortcut || Date.now() >= shortcut.expiresAt) {
          await this.clearCopyShortcuts();
          this.showMessage('This credential copy shortcut has expired. Nothing was copied.');
          return;
        }
        await this.clipboard.copy(shortcut.value, shortcut.label);
        this.showMessage(`${shortcut.label} copied`);
      });
      this.initialised = true;
      try {
        await this.removeDeliveredCopyNotifications();
      } catch {
        // A stale notification is harmless: no credential value survives an app restart.
      }
    } catch {
      this.showMessage('Android credential notifications could not be initialised.');
    }
  }

  async sendCopyShortcuts(item: VaultItem): Promise<boolean> {
    if (!this.isAndroid()) {
      this.showMessage('Credential copy notifications are available only in the Android app.');
      return false;
    }
    await this.initialise();
    if (!this.initialised) return false;
    try {
      const fields = item.fields.filter(
        (field) => NOTIFIABLE_TYPES.has(field.type) && field.value.trim().length > 0,
      );
      if (!fields.length) {
        this.showMessage('This item has no username, email, or password to send.');
        return false;
      }
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') {
        permission = await LocalNotifications.requestPermissions();
      }
      if (permission.display !== 'granted') {
        this.showMessage('Android notification permission was not granted.');
        return false;
      }
      await this.clearCopyShortcuts();
      const expiresAt = Date.now() + COPY_WINDOW_MS;
      const notifications = fields.map((field, index) => {
        const id = this.notificationId(item.id, field.id, index);
        this.shortcuts.set(id, { value: field.value, label: field.label, expiresAt });
        return {
          id,
          title: `${field.label} — ${item.title}`,
          body: 'Touch to copy. Available for 3 minutes.',
          channelId: CHANNEL_ID,
          actionTypeId: COPY_ACTION_TYPE,
          smallIcon: 'ic_stat_vault_nest',
          largeIcon: 'ic_launcher',
          iconColor: this.theme.resolvedDark() ? '#bfea78' : '#3e6b19',
          autoCancel: false,
          extra: { source: 'vault-nest-copy', copyId: id },
        };
      });
      await LocalNotifications.schedule({
        notifications,
      });
      this.scheduleNativeNotificationCleanup([...this.shortcuts.keys()], COPY_WINDOW_MS);
      this.expiryTimer = setTimeout(() => void this.clearCopyShortcuts(), COPY_WINDOW_MS);
      this.showMessage(
        `${fields.length} copy ${fields.length === 1 ? 'shortcut is' : 'shortcuts are'} available for 3 minutes, even after locking.`,
      );
      return true;
    } catch {
      await this.clearCopyShortcuts();
      this.showMessage('Credential copy notifications could not be created.');
      return false;
    }
  }

  async clearCopyShortcuts(): Promise<void> {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    const ids = [...this.shortcuts.keys()];
    this.shortcuts.clear();
    this.scheduleNativeNotificationCleanup(ids, 0);
    if (!this.isAndroid()) return;
    try {
      if (ids.length) {
        await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      }
      await this.removeDeliveredCopyNotifications();
    } catch {
      this.showMessage(
        'Credential values expired, but Android could not dismiss every notification.',
      );
    }
  }

  private notificationId(itemId: string, fieldId: string, index: number): number {
    let hash = 17;
    for (const character of `${itemId}:${fieldId}`) {
      hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
    }
    return 100_000_000 + (Math.abs(hash) % 100_000_000) * 10 + index;
  }

  private async removeDeliveredCopyNotifications(): Promise<void> {
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const notifications = delivered.notifications.filter((notification) => {
      const extra = notification.extra as Record<string, unknown> | undefined;
      return extra?.['source'] === 'vault-nest-copy';
    });
    if (notifications.length) {
      await LocalNotifications.removeDeliveredNotifications({ notifications });
    }
  }

  private scheduleNativeNotificationCleanup(ids: readonly number[], delayMs: number): void {
    if (!ids.length) return;
    try {
      (
        this.document.defaultView as NativeCredentialNotificationWindow | null
      )?.VaultNestNative?.cancelCredentialNotifications(ids.join(','), delayMs);
    } catch {
      // Native notification cleanup is only available in the Android shell.
    }
  }

  private showMessage(message: string): void {
    this.lastMessage.set(message);
    setTimeout(() => {
      if (this.lastMessage() === message) this.lastMessage.set(null);
    }, 2600);
  }
}
