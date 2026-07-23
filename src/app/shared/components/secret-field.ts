import { Component, inject, input, signal } from '@angular/core';
import type { VaultField } from '../../core/models/vault.models';
import { ClipboardService } from '../../core/services/clipboard.service';
import { PasswordStrengthService } from '../../core/services/password-strength.service';
import { AppIcon } from './app-icon';

@Component({
  selector: 'app-secret-field',
  imports: [AppIcon],
  template: `<div class="field">
      <div class="value">
        <span>{{ field().label }}</span
        ><strong>{{ field().sensitive && !revealed() ? '••••••••••••' : field().value }}</strong>
      </div>
      <div class="actions">
        @if (field().sensitive) {
          <button
            class="icon-button"
            type="button"
            (click)="revealed.set(!revealed())"
            [attr.aria-label]="revealed() ? 'Hide ' + field().label : 'Reveal ' + field().label"
          >
            <app-icon [name]="revealed() ? 'eye_off' : 'eye'" />
          </button>
        }
        <button
          class="icon-button"
          type="button"
          (click)="copy()"
          [attr.aria-label]="'Copy ' + field().label"
        >
          <app-icon name="copy" />
        </button>
      </div>
    </div>
    @if (field().type === 'PASSWORD' && field().value) {
      @let analysis = strength.analyse(field().value);
      <div
        class="password-strength"
        [attr.data-score]="analysis.score"
        [attr.aria-label]="analysis.label + '. Crack time: ' + analysis.crackTime"
      >
        <div class="strength-track" aria-hidden="true">
          @for (segment of strengthSegments; track segment) {
            <i [class.active]="segment <= analysis.score"></i>
          }
        </div>
        <p>
          <strong>{{ analysis.label }}</strong>
          <span>Crack time: {{ analysis.crackTime }}</span>
        </p>
      </div>
    }
    @if (message()) {
      <span class="toast" role="status">{{ message() }}</span>
    }`,
  styles: `
    .field {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.9rem 0;
      border-bottom: 1px solid var(--border);
    }
    .value {
      display: grid;
      min-width: 0;
      flex: 1;
      gap: 0.25rem;
    }
    .value span {
      color: var(--text-muted);
      font-size: 0.72rem;
    }
    .value strong {
      overflow-wrap: anywhere;
      font-size: 0.9rem;
      white-space: pre-wrap;
    }
    .actions {
      display: flex;
    }
    .password-strength {
      display: grid;
      gap: 0.4rem;
      padding: 0 0 0.8rem;
      border-bottom: 1px solid var(--border);
    }
    .strength-track {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.25rem;
    }
    .strength-track i {
      height: 0.24rem;
      border-radius: 99px;
      background: var(--border-strong);
    }
    .password-strength[data-score='1'] i.active {
      background: var(--danger);
    }
    .password-strength[data-score='2'] i.active {
      background: var(--warning);
    }
    .password-strength[data-score='3'] i.active,
    .password-strength[data-score='4'] i.active {
      background: var(--accent-strong);
    }
    .password-strength p {
      display: flex;
      justify-content: space-between;
      gap: 0.6rem;
      margin: 0;
      color: var(--text-muted);
      font-size: 0.68rem;
    }
    .password-strength strong {
      color: var(--text);
    }
    @media (max-width: 420px) {
      .password-strength p {
        align-items: flex-start;
        flex-direction: column;
        gap: 0.2rem;
      }
    }
    .toast {
      position: fixed;
      right: 1rem;
      bottom: 5rem;
      z-index: 50;
      padding: 0.7rem 1rem;
      border-radius: 0.7rem;
      background: var(--text);
      color: var(--surface);
      font-size: 0.8rem;
      box-shadow: var(--shadow-lg);
    }
  `,
})
export class SecretField {
  private readonly clipboard = inject(ClipboardService);
  readonly strength = inject(PasswordStrengthService);
  readonly field = input.required<VaultField>();
  readonly strengthSegments = [1, 2, 3, 4] as const;
  readonly revealed = signal(false);
  readonly message = signal('');
  async copy(): Promise<void> {
    await this.clipboard.copy(this.field().value, this.field().label);
    this.message.set(`${this.field().label} copied. Clipboard clears in 5 minutes.`);
    setTimeout(() => this.message.set(''), 1800);
  }
}
