import { Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import { AppIcon } from './app-icon';

@Component({
  selector: 'app-action-dialog',
  imports: [AppIcon],
  template: `
    @if (open()) {
      <div class="backdrop" role="presentation">
        <button
          class="dismiss-layer"
          type="button"
          [attr.aria-label]="'Cancel ' + title()"
          (click)="cancel()"
        ></button>
        <section
          class="dialog"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="dialogId() + '-title'"
          [attr.aria-describedby]="dialogId() + '-description'"
        >
          <span class="icon"><app-icon [name]="iconName()" /></span>
          <div>
            <h2 [id]="dialogId() + '-title'">{{ title() }}</h2>
            <p [id]="dialogId() + '-description'">{{ message() }}</p>
          </div>
          <div class="actions">
            <button class="secondary-button" type="button" (click)="cancel()">
              {{ cancelLabel() }}
            </button>
            <button #confirmButton class="primary-button" type="button" (click)="confirmed.emit()">
              {{ confirmLabel() }}
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
      z-index: 140;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: #071016b8;
      backdrop-filter: blur(4px);
    }
    .dismiss-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      border: 0;
      background: transparent;
      cursor: default;
    }
    .dialog {
      position: relative;
      width: min(100%, 29rem);
      display: grid;
      gap: 1rem;
      padding: 1.4rem;
      border: 1px solid var(--border);
      border-radius: 1rem;
      background: var(--surface);
      box-shadow: var(--shadow-lg);
    }
    .icon {
      display: grid;
      width: 3rem;
      height: 3rem;
      place-items: center;
      border-radius: 0.85rem;
      background: var(--accent-soft);
      color: var(--accent-strong);
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
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.6rem;
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
export class ActionDialog {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly dialogId = input('action-dialog');
  readonly confirmLabel = input('OK');
  readonly cancelLabel = input('Cancel');
  readonly iconName = input('shield');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  constructor() {
    effect(() => {
      if (this.open()) this.confirmButton()?.nativeElement.focus();
    });
  }

  cancel(): void {
    if (this.open()) this.cancelled.emit();
  }
}
