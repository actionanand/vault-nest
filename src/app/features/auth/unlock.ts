import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';
import { CredentialNotificationService } from '../../core/services/credential-notification.service';
import { AppIcon } from '../../shared/components/app-icon';
import { BrandMark } from '../../shared/components/brand-mark';

@Component({
  selector: 'app-unlock',
  imports: [ReactiveFormsModule, AppIcon, BrandMark],
  template: `<main class="auth-page">
    <section class="auth-card compact" aria-labelledby="unlock-title">
      <app-brand-mark />
      <div>
        <p class="eyebrow">Welcome back</p>
        <h1 id="unlock-title">Unlock Vault Nest</h1>
        <p class="lede">Your key exists only in memory while the vault is open.</p>
      </div>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label
          >{{ useEasyLogin() ? easyLoginLabel() : 'Master password'
          }}<span class="field"
            ><input
              [type]="visible() ? 'text' : 'password'"
              formControlName="password"
              [attr.maxlength]="useEasyLogin() ? 4 : null"
              [attr.autocomplete]="useEasyLogin() ? 'off' : 'current-password'" /><button
              class="icon-button"
              type="button"
              (click)="visible.set(!visible())"
              [attr.aria-label]="visible() ? 'Hide password' : 'Show password'"
            >
              <app-icon [name]="visible() ? 'eye_off' : 'eye'" /></button></span
        ></label>
        @if (auth.error() && !cooldownActive() && !auth.easyVerificationRequired()) {
          <p class="form-error" role="alert">{{ auth.error() }}</p>
        }
        @if (cooldownActive()) {
          <p class="form-error" role="timer">
            Password entry is paused. Try again in {{ cooldownText() }}, or use Android biometrics.
          </p>
        }
        @if (auth.easyVerificationRequired()) {
          <p class="form-error" role="alert">
            Easy login reached its limit. Enter the full master password ({{
              auth.easyVerificationAttemptsRemaining()
            }}
            attempts remaining) or use Android biometrics.
          </p>
        }
        @if (auth.hint() && !useEasyLogin()) {
          <p class="hint">Hint: {{ auth.hint() }}</p>
        }
        <button class="primary-button" type="submit" [disabled]="busy() || cooldownActive()">
          <app-icon name="lock" />{{ busy() ? 'Unlocking…' : 'Unlock vault' }}
        </button>
        @if (auth.easyUnlockMode() !== 'DISABLED' && !auth.easyVerificationRequired()) {
          <button class="secondary-button" type="button" (click)="toggleLoginMode()">
            {{ useEasyLogin() ? 'Use full master password' : 'Use 4-character easy login' }}
          </button>
        }
        @if (auth.biometricEnabled()) {
          <button
            class="secondary-button"
            type="button"
            [disabled]="busy()"
            (click)="unlockBiometric()"
          >
            <app-icon name="biometric" /> Unlock with biometrics
          </button>
        }
      </form>
      <p class="privacy-note"><app-icon name="shield" /> Completely offline by design.</p>
    </section>
  </main>`,
  styleUrl: './auth.scss',
})
export class Unlock implements OnDestroy {
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly credentialNotifications = inject(CredentialNotificationService);
  readonly visible = signal(false);
  readonly busy = signal(false);
  readonly useEasyLogin = signal(
    this.auth.easyUnlockMode() !== 'DISABLED' && !this.auth.easyVerificationRequired(),
  );
  readonly clock = signal(Date.now());
  readonly cooldownActive = computed(() => (this.auth.cooldownUntil() ?? 0) > this.clock());
  readonly cooldownText = computed(() => {
    const seconds = Math.max(
      0,
      Math.ceil(((this.auth.cooldownUntil() ?? 0) - this.clock()) / 1000),
    );
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours
      ? `${hours}h ${minutes}m`
      : minutes
        ? `${minutes}m ${remainder}s`
        : `${remainder}s`;
  });
  private readonly clockTimer = globalThis.setInterval(() => this.clock.set(Date.now()), 1000);
  readonly easyLoginLabel = computed(() =>
    this.auth.easyUnlockMode() === 'FIRST_4'
      ? 'First 4 characters of your master password'
      : 'Last 4 characters of your master password',
  );
  readonly form = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      const value = this.form.controls.password.value;
      const unlocked = this.useEasyLogin()
        ? await this.auth.unlockEasy(value)
        : await this.auth.unlock(value);
      if (unlocked) {
        this.form.reset();
        await this.router.navigateByUrl('/vault');
      } else if (this.auth.accountWasDeleted()) {
        await this.credentialNotifications.clearCopyShortcuts();
        this.form.reset();
        await this.router.navigateByUrl('/setup');
      } else if (this.auth.easyVerificationRequired()) {
        this.useEasyLogin.set(false);
        this.form.reset();
      }
    } catch (error: unknown) {
      this.auth.error.set(
        error instanceof Error ? error.message : 'The unlock attempt could not be processed.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  toggleLoginMode(): void {
    this.useEasyLogin.update((value) => !value);
    this.form.reset();
    this.auth.error.set(null);
  }

  async unlockBiometric(): Promise<void> {
    this.busy.set(true);
    try {
      if (await this.auth.unlockWithBiometric()) await this.router.navigateByUrl('/vault');
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    globalThis.clearInterval(this.clockTimer);
  }
}
