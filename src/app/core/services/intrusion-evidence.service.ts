import { DOCUMENT } from '@angular/common';
import { inject, Service, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { StorageEngine } from '../storage/storage-engine';

export interface IntrusionEvidenceEntry {
  readonly id: string;
  readonly capturedAt: string;
}

interface NativeEvidenceBridge {
  deleteAllIntrusionEvidence(): void;
  deleteIntrusionEvidence(id: string): void;
  listIntrusionEvidence(): string;
  readIntrusionEvidence(id: string): string;
  saveIntrusionEvidence(id: string, fileName: string): void;
  setVaultUnlocked(unlocked: boolean): void;
  storeIntrusionEvidence(timestamp: number, base64Jpeg: string): void;
}

interface NativeEvidenceWindow extends Window {
  VaultNestNative?: NativeEvidenceBridge;
}

@Service()
export class IntrusionEvidenceService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StorageEngine);
  readonly entries = signal<readonly IntrusionEvidenceEntry[]>([]);
  readonly selectedImage = signal<string | null>(null);
  readonly filePickerActive = signal(false);
  private generation = 0;

  isAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  setVaultUnlocked(unlocked: boolean): void {
    try {
      this.bridge()?.setVaultUnlocked(unlocked);
    } catch {
      // Browser builds and older native shells do not expose the evidence bridge.
    }
  }

  async requestPermission(): Promise<void> {
    if (!this.isAndroid())
      throw new Error('Intrusion evidence is available only in the Android app.');
    const permission = await Camera.requestPermissions({ permissions: ['camera'] });
    if (permission.camera !== 'granted')
      throw new Error('Front-camera permission was not granted.');
    const stream = await this.openFrontCamera();
    stream.getTracks().forEach((track) => track.stop());
  }

  async captureIfEnabled(): Promise<void> {
    const preferences = await this.storage.getPreferences();
    if (!this.isAndroid() || !preferences?.intrusionEvidenceEnabled) return;
    const generation = this.generation;
    let stream: MediaStream | null = null;
    try {
      stream = await this.openFrontCamera();
      const video = this.document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      await new Promise<void>((resolve) => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) resolve();
        else video.addEventListener('loadeddata', () => resolve(), { once: true });
      });
      const width = Math.min(720, video.videoWidth || 720);
      const height = Math.max(
        1,
        Math.round(width * ((video.videoHeight || 960) / (video.videoWidth || 720))),
      );
      const canvas = this.document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
      const jpeg = canvas.toDataURL('image/jpeg', 0.72).split(',')[1];
      if (!jpeg) return;
      if (generation === this.generation) {
        this.bridge()?.storeIntrusionEvidence(Date.now(), jpeg);
      }
    } catch {
      // A revoked permission or unavailable camera must never reveal or delay unlock handling.
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  refresh(): void {
    try {
      const payload = this.bridge()?.listIntrusionEvidence() ?? '[]';
      const parsed = JSON.parse(payload) as unknown;
      this.entries.set(Array.isArray(parsed) ? parsed.filter(this.isEntry) : []);
    } catch {
      this.entries.set([]);
    }
  }

  select(entry: IntrusionEvidenceEntry): void {
    try {
      const base64 = this.bridge()?.readIntrusionEvidence(entry.id);
      this.selectedImage.set(base64 ? `data:image/jpeg;base64,${base64}` : null);
    } catch {
      this.selectedImage.set(null);
    }
  }

  download(entry: IntrusionEvidenceEntry): void {
    const fileName = `vault-nest-intrusion-${entry.capturedAt.replaceAll(':', '-')}.jpg`;
    const bridge = this.bridge();
    if (bridge) {
      const window = this.document.defaultView;
      const handler = (event: Event) => {
        const detail = (event as CustomEvent<{ action: string }>).detail;
        if (detail.action !== 'evidence-saved') return;
        window?.removeEventListener('vault-nest-native-result', handler);
        this.filePickerActive.set(false);
      };
      this.filePickerActive.set(true);
      window?.addEventListener('vault-nest-native-result', handler);
      try {
        bridge.saveIntrusionEvidence(entry.id, fileName);
      } catch {
        window?.removeEventListener('vault-nest-native-result', handler);
        this.filePickerActive.set(false);
      }
      return;
    }
    const dataUrl = this.selectedImage();
    if (!dataUrl) return;
    const anchor = this.document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  delete(entry: IntrusionEvidenceEntry): void {
    this.bridge()?.deleteIntrusionEvidence(entry.id);
    this.selectedImage.set(null);
    this.refresh();
  }

  deleteAll(): void {
    this.generation += 1;
    this.bridge()?.deleteAllIntrusionEvidence();
    this.selectedImage.set(null);
    this.entries.set([]);
  }

  private openFrontCamera(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('The front camera is unavailable on this device.');
    }
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: 'user' }, width: { ideal: 720 } },
    });
  }

  private bridge(): NativeEvidenceBridge | undefined {
    return (this.document.defaultView as NativeEvidenceWindow | null)?.VaultNestNative;
  }

  private readonly isEntry = (value: unknown): value is IntrusionEvidenceEntry => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Record<string, unknown>;
    return typeof entry['id'] === 'string' && typeof entry['capturedAt'] === 'string';
  };
}
