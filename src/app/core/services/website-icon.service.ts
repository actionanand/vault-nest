import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import type { VaultItem } from '../models/vault.models';
import { VaultStore } from './vault.store';

interface WebsiteIconBridge {
  fetchWebsiteIcon(websiteUrl: string, requestId: string): void;
}

interface WebsiteIconWindow extends Window {
  VaultNestNative?: WebsiteIconBridge;
}

interface NativeResultDetail {
  readonly action?: string;
  readonly success?: boolean;
  readonly data?: string;
  readonly message?: string;
}

interface WebsiteIconResult {
  readonly requestId: string;
  readonly dataUrl: string;
}

interface PendingRequest {
  readonly resolve: (value: string | null) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

@Service()
export class WebsiteIconService {
  private readonly document = inject(DOCUMENT);
  private readonly vault = inject(VaultStore);
  private readonly pending = new Map<string, PendingRequest>();
  private listening = false;

  isAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  firstWebsite(item: VaultItem): string | null {
    const value = item.fields.find(
      (field) => ['WEBSITE', 'APPLICATION'].includes(field.type) && field.value.trim().length > 0,
    )?.value;
    return value?.trim() ?? null;
  }

  async refreshItem(item: VaultItem): Promise<boolean> {
    const website = this.firstWebsite(item);
    if (!website || !this.isAndroid()) return false;
    const dataUrl = await this.fetch(website);
    if (!dataUrl) return false;
    const current = this.vault.items().find((candidate) => candidate.id === item.id);
    if (!current || this.firstWebsite(current) !== website) return false;
    try {
      await this.vault.save({ ...current, icon: dataUrl }, { select: false });
      return true;
    } catch {
      return false;
    }
  }

  async refreshMissing(items: readonly VaultItem[]): Promise<void> {
    if (!this.isAndroid()) return;
    for (const item of items) {
      if (item.icon || !this.firstWebsite(item)) continue;
      await this.refreshItem(item);
    }
  }

  private fetch(websiteUrl: string): Promise<string | null> {
    this.listen();
    const bridge = (this.document.defaultView as WebsiteIconWindow | null)?.VaultNestNative;
    if (!bridge?.fetchWebsiteIcon) return Promise.resolve(null);
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(null);
      }, 35_000);
      this.pending.set(requestId, { resolve, timer });
      try {
        bridge.fetchWebsiteIcon(websiteUrl, requestId);
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve(null);
      }
    });
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.document.defaultView?.addEventListener('vault-nest-native-result', (event: Event) => {
      const detail = (event as CustomEvent<NativeResultDetail>).detail;
      if (detail.action !== 'website-icon') return;
      let result: WebsiteIconResult | null;
      try {
        result = detail.data ? (JSON.parse(detail.data) as WebsiteIconResult) : null;
      } catch {
        return;
      }
      if (!result?.requestId) return;
      const pending = this.pending.get(result.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(result.requestId);
      pending.resolve(
        detail.success && result.dataUrl.startsWith('data:image/') ? result.dataUrl : null,
      );
    });
  }
}
