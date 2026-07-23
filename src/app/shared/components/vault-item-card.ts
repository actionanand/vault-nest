import { Component, input, output } from '@angular/core';
import type { VaultItem } from '../../core/models/vault.models';
import { AppIcon } from './app-icon';
import { VaultItemIcon } from './vault-item-icon';

@Component({
  selector: 'app-vault-item-card',
  imports: [AppIcon, VaultItemIcon],
  template: `<button
    type="button"
    class="card"
    [class.selected]="selected()"
    (click)="chosen.emit(item().id)"
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
  </button>`,
  styles: `
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
    .card.selected {
      border-color: var(--border);
      background: var(--surface);
    }
    .card.selected {
      box-shadow: var(--shadow-sm);
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
  `,
})
export class VaultItemCard {
  readonly item = input.required<VaultItem>();
  readonly selected = input(false);
  readonly chosen = output<string>();
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
