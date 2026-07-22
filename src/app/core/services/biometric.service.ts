import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';

interface NativeSecurityBridge {
  authenticateBiometric(): void;
  disableBiometric(): void;
  enableBiometric(base64VaultKey: string): void;
  isBiometricAvailable(): boolean;
}

interface NativeSecurityWindow extends Window {
  VaultNestNative?: NativeSecurityBridge;
}

interface NativeResultDetail {
  readonly action: string;
  readonly success: boolean;
  readonly data?: string;
  readonly message?: string;
}

@Service()
export class BiometricService {
  private readonly document = inject(DOCUMENT);
  readonly available = signal(false);

  refreshAvailability(): void {
    try {
      this.available.set(this.bridge()?.isBiometricAvailable() === true);
    } catch {
      this.available.set(false);
    }
  }

  async enable(rawVaultKey: Uint8Array): Promise<void> {
    const bridge = this.requireBridge();
    await this.waitForResult('biometric-enabled', () =>
      bridge.enableBiometric(this.toBase64(rawVaultKey)),
    );
  }

  async authenticate(): Promise<Uint8Array<ArrayBuffer>> {
    const bridge = this.requireBridge();
    return this.fromBase64(
      await this.waitForResult('biometric-unlock', () => bridge.authenticateBiometric()),
    );
  }

  disable(): void {
    try {
      this.bridge()?.disableBiometric();
    } catch {
      // A missing native bridge means there is no device key to remove.
    }
  }

  private bridge(): NativeSecurityBridge | undefined {
    return (this.document.defaultView as NativeSecurityWindow | null)?.VaultNestNative;
  }

  private requireBridge(): NativeSecurityBridge {
    const bridge = this.bridge();
    if (!bridge) throw new Error('Biometric authentication is available only in the Android app.');
    return bridge;
  }

  private waitForResult(action: string, start: () => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const window = this.document.defaultView;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const handler = (event: Event) => {
        const detail = (event as CustomEvent<NativeResultDetail>).detail;
        if (detail.action !== action) return;
        finish(
          detail.success,
          detail.data ?? '',
          detail.message ?? 'Biometric authentication failed.',
        );
      };
      function finish(success: boolean, data: string, message: string): void {
        if (timeout) globalThis.clearTimeout(timeout);
        window?.removeEventListener('vault-nest-native-result', handler);
        if (success) resolve(data);
        else reject(new Error(message));
      }
      timeout = globalThis.setTimeout(
        () => finish(false, '', 'Biometric authentication timed out.'),
        60_000,
      );
      window?.addEventListener('vault-nest-native-result', handler);
      start();
    });
  }

  private toBase64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  private fromBase64(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }
}
