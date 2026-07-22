import { Component, effect, input, output, signal } from '@angular/core';
import { AppIcon } from './app-icon';

@Component({
  selector: 'app-confirmation-dialog',
  imports: [AppIcon],
  template: `
    @if (open()) {
      <div class="backdrop" role="presentation">
        <section
          class="dialog"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="dialogId() + '-title'"
          [attr.aria-describedby]="dialogId() + '-description'"
        >
          <span class="icon"><app-icon [name]="iconName()" /></span>
          <div>
            <h2 [id]="dialogId() + '-title'">{{ title() }}</h2>
            <p [id]="dialogId() + '-description'">{{ message() }}</p>
          </div>
          <label class="acknowledgement">
            <input
              type="checkbox"
              [checked]="acknowledged()"
              (change)="setAcknowledgement($event)"
            />
            <span>{{ acknowledgementLabel() }}</span>
          </label>
          <div class="actions">
            <button class="secondary-button" type="button" (click)="cancel()">
              {{ cancelLabel() }}
            </button>
            <button
              class="confirm-button"
              type="button"
              [disabled]="!acknowledged() || busy()"
              (click)="confirm()"
            >
              <app-icon [name]="iconName()" />
              {{ busy() ? busyLabel() : confirmLabel() }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 120;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: #071016b8;
      backdrop-filter: blur(4px);
    }
    .dialog {
      width: min(100%, 29rem);
      display: grid;
      gap: 1rem;
      padding: 1.4rem;
      border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border));
      border-radius: 1.1rem;
      background: var(--surface);
      box-shadow: var(--shadow-lg);
    }
    .icon {
      display: grid;
      width: 3rem;
      height: 3rem;
      place-items: center;
      border-radius: 0.85rem;
      background: var(--danger-soft);
      color: var(--danger);
    }
    h2 {
      margin: 0;
      font-size: 1.15rem;
    }
    p {
      margin: 0.4rem 0 0;
      color: var(--text-muted);
      font-size: 0.78rem;
      line-height: 1.55;
    }
    .acknowledgement {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: start;
      gap: 0.55rem;
      color: var(--danger);
      font-size: 0.74rem;
      font-weight: 650;
      line-height: 1.45;
    }
    .acknowledgement input {
      width: 1.15rem;
      height: 1.15rem;
      margin: 0.1rem 0 0;
      accent-color: var(--danger);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.6rem;
      margin-top: 0.3rem;
    }
    .confirm-button {
      display: inline-flex;
      min-height: 2.8rem;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.65rem 1rem;
      border: 1px solid var(--danger);
      border-radius: 0.7rem;
      background: var(--danger);
      color: #fff;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 750;
    }
    .confirm-button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    @media (max-width: 420px) {
      .actions {
        flex-direction: column-reverse;
      }
      .actions > * {
        width: 100%;
      }
    }
  `,
  host: { '(document:keydown.escape)': 'cancel()' },
})
export class ConfirmationDialog {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly dialogId = input('confirmation-dialog');
  readonly acknowledgementLabel = input('I understand that this action cannot be undone.');
  readonly confirmLabel = input('Delete permanently');
  readonly cancelLabel = input('Cancel');
  readonly busyLabel = input('Deleting…');
  readonly busy = input(false);
  readonly iconName = input('trash');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  readonly acknowledged = signal(false);

  constructor() {
    effect(() => {
      if (!this.open()) this.acknowledged.set(false);
    });
  }

  setAcknowledgement(event: Event): void {
    this.acknowledged.set((event.target as HTMLInputElement).checked);
  }
  confirm(): void {
    if (this.acknowledged() && !this.busy()) this.confirmed.emit();
  }
  cancel(): void {
    if (!this.open() || this.busy()) return;
    this.acknowledged.set(false);
    this.cancelled.emit();
  }
}
