import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/services/auth.store';
import { AppIcon } from '../../shared/components/app-icon';
import { BrandMark } from '../../shared/components/brand-mark';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmation = control.get('confirm')?.value;
  return password && confirmation && password !== confirmation ? { passwordMismatch: true } : null;
}

@Component({
  selector: 'app-setup',
  imports: [ReactiveFormsModule, AppIcon, BrandMark],
  templateUrl: './setup.html',
  styleUrl: './auth.scss',
})
export class Setup {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly showPassword = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly accountWasDeleted = this.auth.accountWasDeleted;
  readonly form = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(12),
          Validators.pattern(/[a-z]/),
          Validators.pattern(/[A-Z]/),
          Validators.pattern(/[0-9]/),
          Validators.pattern(/[^A-Za-z0-9\s]/),
        ],
      }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      hint: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
      acknowledgement: new FormControl(false, {
        nonNullable: true,
        validators: [Validators.requiredTrue],
      }),
    },
    { validators: passwordsMatch },
  );

  passwordMeets(condition: 'length' | 'lowercase' | 'uppercase' | 'number' | 'symbol'): boolean {
    const password = this.form.controls.password.value;
    const tests = {
      length: password.length >= 12,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      symbol: /[^A-Za-z0-9\s]/.test(password),
    };
    return tests[condition];
  }

  passwordIsInvalid(): boolean {
    const control = this.form.controls.password;
    return control.invalid && (control.dirty || control.touched);
  }

  confirmationIsInvalid(): boolean {
    const control = this.form.controls.confirm;
    return (
      (control.invalid || this.form.hasError('passwordMismatch')) &&
      (control.dirty || control.touched)
    );
  }
  async submit(): Promise<void> {
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { password, confirm, hint } = this.form.getRawValue();
    if (password !== confirm) {
      this.error.set('The passwords do not match.');
      return;
    }
    this.saving.set(true);
    try {
      await this.auth.setup(password, hint);
      this.form.reset();
      await this.router.navigateByUrl('/vault');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'The vault could not be created.');
    } finally {
      this.saving.set(false);
    }
  }
}
