import { DOCUMENT } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../core/services/auth.store';
import { VaultStore } from '../../core/services/vault.store';
import { AppIcon } from '../../shared/components/app-icon';
import { BrandMark } from '../../shared/components/brand-mark';
import { StorageEngine } from '../../core/storage/storage-engine';
import { DEFAULT_PREFERENCES, type VaultPreferences } from '../../core/models/vault.models';

@Component({
  selector: 'app-vault-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule, AppIcon, BrandMark],
  templateUrl: './vault-shell.html',
  styleUrl: './vault-shell.scss',
  host: {
    '(document:pointerdown)': 'activity()',
    '(document:keydown)': 'activity()',
    '(document:keydown.escape)': 'closeRemoveAccount()',
    '(document:visibilitychange)': 'visibilityChanged()',
  },
})
export class VaultShell implements OnInit, OnDestroy {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly vault = inject(VaultStore);
  private readonly storage = inject(StorageEngine);
  private readonly document = inject(DOCUMENT);
  private preferences: VaultPreferences = DEFAULT_PREFERENCES;
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly drawerOpen = signal(false);
  readonly removeAccountOpen = signal(false);
  readonly removingAccount = signal(false);
  readonly removeAccountError = signal('');
  readonly removeAccountForm = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    acknowledgement: new FormControl(false, {
      nonNullable: true,
      validators: [Validators.requiredTrue],
    }),
  });
  async ngOnInit(): Promise<void> {
    this.preferences = {
      ...DEFAULT_PREFERENCES,
      ...((await this.storage.getPreferences()) ?? {}),
    };
    await this.vault.load();
    this.timer = setInterval(() => this.checkAutoLock(), 15_000);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  async lock(): Promise<void> {
    this.vault.clear();
    this.auth.lock();
    await this.router.navigateByUrl('/unlock');
  }
  openRemoveAccount(): void {
    this.drawerOpen.set(false);
    this.removeAccountError.set('');
    this.removeAccountForm.reset();
    this.removeAccountOpen.set(true);
  }
  closeRemoveAccount(): void {
    if (this.removingAccount()) return;
    this.removeAccountOpen.set(false);
    this.removeAccountForm.reset();
    this.removeAccountError.set('');
  }
  async removeAccount(): Promise<void> {
    if (this.removeAccountForm.invalid) {
      this.removeAccountForm.markAllAsTouched();
      return;
    }
    this.removingAccount.set(true);
    this.removeAccountError.set('');
    try {
      const deleted = await this.auth.deleteAccount(this.removeAccountForm.controls.password.value);
      if (!deleted) {
        this.removeAccountError.set('The master password is incorrect. Nothing was deleted.');
        return;
      }
      this.vault.clear();
      this.removeAccountOpen.set(false);
      this.removeAccountForm.reset();
      await this.router.navigateByUrl('/setup');
    } catch (error: unknown) {
      this.removeAccountError.set(
        error instanceof Error ? error.message : 'The local vault could not be deleted.',
      );
    } finally {
      this.removingAccount.set(false);
    }
  }
  closeDrawer(): void {
    this.drawerOpen.set(false);
  }
  activity(): void {
    this.auth.touch();
  }
  visibilityChanged(): void {
    if (this.document.visibilityState === 'hidden' && this.preferences.lockOnBackground)
      void this.lock();
  }
  private checkAutoLock(): void {
    if (
      this.preferences.autoLockMinutes > 0 &&
      this.auth.inactiveForMs() >= this.preferences.autoLockMinutes * 60_000
    )
      void this.lock();
  }
}
