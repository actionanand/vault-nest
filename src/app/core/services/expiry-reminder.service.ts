import { Service, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { VaultItem } from '../models/vault.models';

const CHANNEL_ID = 'vault-nest-expiry-reminders';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1_000;

@Service()
export class ExpiryReminderService {
  private initialised = false;
  readonly lastMessage = signal<string | null>(null);

  isAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  async sync(items: readonly VaultItem[]): Promise<void> {
    if (!this.isAndroid()) return;
    await this.initialise();
    if (!this.initialised) return;
    try {
      const candidates = items.filter((item) => this.shouldSchedule(item));
      const activeIds = new Set(candidates.map((item) => this.notificationId(item.id)));
      const pending = await LocalNotifications.getPending();
      const stale = pending.notifications.filter((notification) => {
        const extra = notification.extra as Record<string, unknown> | undefined;
        return extra?.['source'] === 'vault-nest-expiry' && !activeIds.has(notification.id);
      });
      if (stale.length) await LocalNotifications.cancel({ notifications: stale });
      if (candidates.length) {
        let permission = await LocalNotifications.checkPermissions();
        if (permission.display !== 'granted') {
          permission = await LocalNotifications.requestPermissions();
        }
        if (permission.display !== 'granted') {
          this.showMessage(
            'Enable Android notifications to receive saved credential expiry reminders.',
          );
          return;
        }
      }
      for (const item of candidates) await this.scheduleForItem(item, false);
    } catch {
      // Scheduling is retried after the next unlock or item update.
    }
  }

  async scheduleForItem(item: VaultItem, requestPermission: boolean): Promise<void> {
    if (!this.isAndroid()) return;
    try {
      await this.initialise();
      if (!this.initialised) return;
      const id = this.notificationId(item.id);
      await this.cancelForItem(item.id);
      if (!this.shouldSchedule(item)) return;

      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted' && requestPermission) {
        permission = await LocalNotifications.requestPermissions();
      }
      if (permission.display !== 'granted') {
        if (requestPermission) {
          this.showMessage('Expiry reminder was not scheduled because notifications are disabled.');
        }
        return;
      }

      const expiry = this.expiryDate(item.expiresAt);
      if (!expiry) return;
      const normalReminder = new Date(expiry.getTime() - THREE_DAYS_MS);
      normalReminder.setHours(9, 0, 0, 0);
      const reminderAt =
        normalReminder.getTime() > Date.now() ? normalReminder : new Date(Date.now() + 5_000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            channelId: CHANNEL_ID,
            title: 'Credential expires soon',
            body: `${item.title} expires on ${this.displayDate(expiry)}.`,
            schedule: { at: reminderAt },
            extra: { source: 'vault-nest-expiry', itemId: item.id },
          },
        ],
      });
      if (requestPermission) {
        this.showMessage(
          normalReminder.getTime() > Date.now()
            ? `Expiry reminder scheduled for ${this.displayDate(normalReminder)}.`
            : 'Expiry is within three days. Android will show the reminder shortly.',
        );
      }
    } catch {
      if (requestPermission) {
        this.showMessage('Android could not schedule this expiry reminder.');
      }
    }
  }

  async cancelForItem(itemId: string): Promise<void> {
    if (!this.isAndroid()) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: this.notificationId(itemId) }] });
      const delivered = await LocalNotifications.getDeliveredNotifications();
      const matching = delivered.notifications.filter((notification) => {
        const extra = notification.extra as Record<string, unknown> | undefined;
        return extra?.['source'] === 'vault-nest-expiry' && extra?.['itemId'] === itemId;
      });
      if (matching.length) {
        await LocalNotifications.removeDeliveredNotifications({ notifications: matching });
      }
    } catch {
      // The notification may not exist or Android may already have removed it.
    }
  }

  async cancelAll(): Promise<void> {
    if (!this.isAndroid()) return;
    try {
      const pending = await LocalNotifications.getPending();
      const reminders = pending.notifications.filter((notification) => {
        const extra = notification.extra as Record<string, unknown> | undefined;
        return extra?.['source'] === 'vault-nest-expiry';
      });
      if (reminders.length) await LocalNotifications.cancel({ notifications: reminders });
      const delivered = await LocalNotifications.getDeliveredNotifications();
      const deliveredReminders = delivered.notifications.filter((notification) => {
        const extra = notification.extra as Record<string, unknown> | undefined;
        return extra?.['source'] === 'vault-nest-expiry';
      });
      if (deliveredReminders.length) {
        await LocalNotifications.removeDeliveredNotifications({
          notifications: deliveredReminders,
        });
      }
    } catch {
      // Account/database deletion remains authoritative even if Android cleanup fails.
    }
  }

  private async initialise(): Promise<void> {
    if (!this.isAndroid() || this.initialised) return;
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Credential expiry reminders',
        description: 'Reminders three days before a saved credential expires',
        importance: 3,
        visibility: 1,
        lights: true,
        vibration: true,
      });
      this.initialised = true;
    } catch {
      this.initialised = false;
    }
  }

  private shouldSchedule(item: VaultItem): boolean {
    const expiry = this.expiryDate(item.expiresAt);
    return (
      expiry !== null &&
      expiry.getTime() > Date.now() &&
      !item.deletedAt &&
      !item.archived &&
      !item.template
    );
  }

  private expiryDate(value: string | undefined): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    if (!match) return null;
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      23,
      59,
      59,
      999,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private displayDate(value: Date): string {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(value);
  }

  private notificationId(itemId: string): number {
    let hash = 23;
    for (const character of itemId) {
      hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
    }
    return 1_200_000_000 + (Math.abs(hash) % 100_000_000);
  }

  private showMessage(message: string): void {
    this.lastMessage.set(message);
    setTimeout(() => {
      if (this.lastMessage() === message) this.lastMessage.set(null);
    }, 3_500);
  }
}
