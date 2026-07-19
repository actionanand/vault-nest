import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';
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
          >Master password<span class="field"
            ><input
              [type]="visible() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="current-password" /><button
              class="icon-button"
              type="button"
              (click)="visible.set(!visible())"
              [attr.aria-label]="visible() ? 'Hide password' : 'Show password'"
            >
              <app-icon [name]="visible() ? 'eye_off' : 'eye'" /></button></span
        ></label>
        @if (auth.error()) {
          <p class="form-error" role="alert">{{ auth.error() }}</p>
        }
        @if (auth.hint()) {
          <p class="hint">Hint: {{ auth.hint() }}</p>
        }
        <button class="primary-button" type="submit" [disabled]="busy()">
          <app-icon name="lock" />{{ busy() ? 'Unlocking…' : 'Unlock vault' }}
        </button>
      </form>
      <p class="privacy-note"><app-icon name="shield" /> Completely offline by design.</p>
    </section>
  </main>`,
  styleUrl: './auth.scss',
})
export class Unlock {
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly visible = signal(false);
  readonly busy = signal(false);
  readonly form = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      if (await this.auth.unlock(this.form.controls.password.value)) {
        this.form.reset();
        await this.router.navigateByUrl('/vault');
      } else if (this.auth.accountWasDeleted()) {
        this.form.reset();
        await this.router.navigateByUrl('/setup');
      }
    } catch (error: unknown) {
      this.auth.error.set(
        error instanceof Error ? error.message : 'The unlock attempt could not be processed.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
