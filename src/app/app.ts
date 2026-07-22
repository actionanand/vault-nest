import { afterNextRender, Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/services/auth.store';
import { ThemeService } from './core/services/theme.service';
import { CredentialNotificationService } from './core/services/credential-notification.service';
import { ScreenshotProtectionService } from './core/services/screenshot-protection.service';

interface NativeLaunchBridge {
  hideSplash(): void;
}

interface NativeLaunchWindow extends Window {
  VaultNestNative?: NativeLaunchBridge;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly theme = inject(ThemeService);
  private readonly credentialNotifications = inject(CredentialNotificationService);
  private readonly screenshotProtection = inject(ScreenshotProtectionService);
  constructor() {
    afterNextRender(() => {
      (globalThis.window as NativeLaunchWindow | undefined)?.VaultNestNative?.hideSplash();
    });
  }
  async ngOnInit(): Promise<void> {
    await this.credentialNotifications.initialise();
    await this.auth.initialise();
    if (this.auth.status() !== 'ERROR') {
      await this.theme.initialise();
      await this.screenshotProtection.initialise();
    }
  }
}
