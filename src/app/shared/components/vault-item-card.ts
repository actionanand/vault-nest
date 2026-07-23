import { Component, input, OnDestroy, output } from '@angular/core';
import type { VaultItem } from '../../core/models/vault.models';
import { AppIcon } from './app-icon';
import { VaultItemIcon } from './vault-item-icon';

@Component({
  selector: 'app-vault-item-card',
  imports: [AppIcon, VaultItemIcon],
  template: `<div
    class="card-wrap"
    [class.batch-mode]="selectionMode()"
    [class.batch-selected]="selected()"
  >
    <button
      type="button"
      class="card"
      [class.active]="active()"
      (click)="activate()"
      (pointerdown)="startHold($event)"
      (pointerup)="cancelHold()"
      (pointercancel)="cancelHold()"
      (pointerleave)="cancelHold()"
    >
      <span class="item-icon"><app-vault-item-icon [item]="item()" /></span
      ><span class="copy"
        ><strong>{{ item().title }}</strong
        ><small>{{ secondary(item()) }}</small></span
      >
      @if (item().favourite) {
        <app-icon name="star" />
      }
      @if (item().expiresAt) {
        <span class="expiry">Expires {{ item().expiresAt }}</span>
      }
    </button>
    <button
      class="selection-toggle"
      type="button"
      [attr.aria-pressed]="selected()"
      [attr.aria-label]="selected() ? 'Deselect ' + item().title : 'Select ' + item().title"
      (click)="selectionToggled.emit(item().id)"
    >
      @if (selected()) {
        <app-icon name="check" />
      }
    </button>
  </div>`,
  styles: `
    .card-wrap {
      position: relative;
    }
    .card {
      display: grid;
      width: 100%;
      min-height: 4.6rem;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.8rem;
      padding: 0.75rem;
      border: 1px solid transparent;
      border-radius: 0.9rem;
      background: transparent;
      color: var(--text);
      text-align: left;
      cursor: pointer;
    }
    .card:hover,
    .card.active,
    .card-wrap.batch-selected .card {
      border-color: var(--border);
      background: var(--surface);
    }
    .card.active,
    .card-wrap.batch-selected .card {
      box-shadow: var(--shadow-sm);
    }
    .card-wrap.batch-selected .card {
      border-color: var(--accent-strong);
      background: var(--accent-soft);
    }
    .item-icon {
      display: grid;
      width: 2.65rem;
      height: 2.65rem;
      place-items: center;
      border-radius: 0.8rem;
      background: var(--accent-soft);
      color: var(--accent-strong);
    }
    .copy {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
    }
    .copy strong,
    .copy small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .copy strong {
      font-size: 0.91rem;
    }
    .copy small {
      color: var(--text-muted);
      font-size: 0.76rem;
    }
    .card > app-icon {
      color: var(--warning);
    }
    .expiry {
      grid-column: 2/-1;
      color: var(--warning);
      font-size: 0.68rem;
    }
    .selection-toggle {
      position: absolute;
      top: 50%;
      right: 0.65rem;
      display: grid;
      width: 1.7rem;
      height: 1.7rem;
      place-items: center;
      padding: 0;
      border: 2px solid var(--border-strong);
      border-radius: 50%;
      background: var(--surface);
      color: var(--accent-ink);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%);
    }
    .selection-toggle[aria-pressed='true'] {
      border-color: var(--accent-strong);
      background: var(--accent);
      opacity: 1;
    }
    .selection-toggle app-icon {
      width: 0.9rem;
      height: 0.9rem;
    }
    .batch-mode .card {
      padding-right: 3rem;
    }
    .batch-mode .selection-toggle {
      opacity: 1;
      pointer-events: auto;
    }
    @media (hover: hover) and (pointer: fine) {
      .card-wrap:hover .selection-toggle,
      .selection-toggle:focus-visible {
        opacity: 1;
        pointer-events: auto;
      }
      .card-wrap:hover .card {
        padding-right: 3rem;
      }
    }
  `,
})
export class VaultItemCard implements OnDestroy {
  readonly item = input.required<VaultItem>();
  readonly active = input(false);
  readonly selected = input(false);
  readonly selectionMode = input(false);
  readonly chosen = output<string>();
  readonly selectionToggled = output<string>();
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holdTriggered = false;

  ngOnDestroy(): void {
    this.cancelHold();
  }
  activate(): void {
    if (this.holdTriggered) {
      this.holdTriggered = false;
      return;
    }
    if (this.selectionMode()) {
      this.selectionToggled.emit(this.item().id);
      return;
    }
    this.chosen.emit(this.item().id);
  }
  startHold(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    this.cancelHold();
    this.holdTimer = setTimeout(() => {
      this.holdTriggered = true;
      this.selectionToggled.emit(this.item().id);
      navigator.vibrate?.(25);
    }, 550);
  }
  cancelHold(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }
  secondary(item: VaultItem): string {
    return (
      item.fields.find((field) => ['USERNAME', 'EMAIL', 'WEBSITE'].includes(field.type))?.value ||
      (
        {
          LOGIN: 'Login',
          NOTE: 'Secure note',
          IDENTITY: 'Identity',
          WIFI: 'Wi-Fi credential',
          CUSTOM: 'Custom item',
        } as const
      )[item.type]
    );
  }
}
