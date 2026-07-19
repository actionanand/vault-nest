import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { VaultStore } from '../../core/services/vault.store';
import { AppIcon } from '../../shared/components/app-icon';
import { SecretField } from '../../shared/components/secret-field';
import { VaultItemCard } from '../../shared/components/vault-item-card';

@Component({
  selector: 'app-vault-home',
  imports: [RouterLink, AppIcon, SecretField, VaultItemCard],
  templateUrl: './vault-home.html',
  styleUrl: './vault-home.scss',
})
export class VaultHome {
  readonly vault = inject(VaultStore);
  private readonly route = inject(ActivatedRoute);
  readonly addOpen = signal(false);
  readonly favouritesOnly = this.route.snapshot.data['favourites'] === true;
  readonly title = this.favouritesOnly ? 'Favourites' : 'All items';
  readonly items = computed(() =>
    this.favouritesOnly ? this.vault.favourites() : this.vault.visibleItems(),
  );
  constructor() {
    const type = this.route.snapshot.queryParamMap.get('type');
    this.vault.typeFilter.set(this.isType(type) ? type : 'ALL');
  }
  setQuery(event: Event): void {
    this.vault.query.set((event.target as HTMLInputElement).value);
  }
  private isType(value: string | null): value is 'LOGIN' | 'NOTE' | 'IDENTITY' | 'WIFI' | 'CUSTOM' {
    return value !== null && ['LOGIN', 'NOTE', 'IDENTITY', 'WIFI', 'CUSTOM'].includes(value);
  }
}
