import { Service, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './auth.store';

const NATIVE_ROUTE_KEY = 'vault-nest-native-route';
const WEAR_SETTINGS_ROUTE = 'wear-os';

@Service()
export class NativeNavigationService {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  requestWearSettings(): void {
    this.writePendingRoute(WEAR_SETTINGS_ROUTE);
    void this.continuePendingRoute();
  }

  async continuePendingRoute(): Promise<boolean> {
    if (this.readPendingRoute() !== WEAR_SETTINGS_ROUTE) return false;
    if (this.auth.status() === 'STARTING') return true;
    if (!this.auth.isUnlocked()) {
      await this.router.navigateByUrl('/unlock');
      return true;
    }
    this.clearPendingRoute();
    await this.router.navigate(['/vault/settings'], { fragment: 'wear-os' });
    return true;
  }

  private readPendingRoute(): string | null {
    try {
      return globalThis.sessionStorage?.getItem(NATIVE_ROUTE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private writePendingRoute(route: string): void {
    try {
      globalThis.sessionStorage?.setItem(NATIVE_ROUTE_KEY, route);
    } catch {
      // Session storage can be unavailable in restricted browser contexts.
    }
  }

  private clearPendingRoute(): void {
    try {
      globalThis.sessionStorage?.removeItem(NATIVE_ROUTE_KEY);
    } catch {
      // Nothing remains to clean up when session storage is unavailable.
    }
  }
}
