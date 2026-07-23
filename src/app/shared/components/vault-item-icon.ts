import { Component, computed, input } from '@angular/core';
import type { VaultItem, VaultItemType } from '../../core/models/vault.models';
import { AppIcon } from './app-icon';

const TYPE_ICONS: Readonly<Record<VaultItemType, string>> = {
  LOGIN: 'key',
  NOTE: 'note',
  IDENTITY: 'identity',
  WIFI: 'wifi',
  CUSTOM: 'custom',
};

@Component({
  selector: 'app-vault-item-icon',
  imports: [AppIcon],
  template: `
    @if (imageSource()) {
      <img [src]="imageSource()" alt="" />
    } @else {
      <app-icon [name]="iconName()" />
    }
  `,
  styles: `
    :host {
      display: grid;
      width: 100%;
      height: 100%;
      place-items: center;
      overflow: hidden;
      border-radius: inherit;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    app-icon {
      width: 48%;
      height: 48%;
    }
  `,
})
export class VaultItemIcon {
  readonly item = input.required<Pick<VaultItem, 'icon' | 'type'>>();
  readonly imageSource = computed(() => {
    const icon = this.item().icon;
    return icon.startsWith('data:image/') ? icon : null;
  });
  readonly iconName = computed(() => {
    const icon = this.item().icon;
    return icon.startsWith('preset:') ? icon.slice('preset:'.length) : TYPE_ICONS[this.item().type];
  });
}
