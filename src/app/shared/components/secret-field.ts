import { Component, inject, input, signal } from '@angular/core';
import type { VaultField } from '../../core/models/vault.models';
import { ClipboardService } from '../../core/services/clipboard.service';
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
    }
    .actions {
      display: flex;
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
  readonly field = input.required<VaultField>();
  readonly revealed = signal(false);
  readonly message = signal('');
  async copy(): Promise<void> {
    await this.clipboard.copy(this.field().value, this.field().label);
    this.message.set(`${this.field().label} copied. Clipboard clears in 5 minutes.`);
    setTimeout(() => this.message.set(''), 1800);
  }
}
