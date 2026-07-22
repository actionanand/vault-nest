import { Component, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { VaultStore } from '../../core/services/vault.store';
import { AppIcon } from '../../shared/components/app-icon';
import { VaultItemDetails } from './vault-item-details';

@Component({
  selector: 'app-item-details-page',
  imports: [RouterLink, AppIcon, VaultItemDetails],
  template: `<main class="item-page">
    <header>
      <a class="icon-button" [routerLink]="backRoute()" aria-label="Back to vault"
        ><app-icon name="back" /></a
      ><span>Credential details</span>
    </header>
    @if (item(); as selected) {
      <app-vault-item-details [item]="selected" />
    } @else {
      <section class="missing">
        <app-icon name="key" />
        <h1>Item not found</h1>
        <a class="secondary-button" routerLink="/vault/all">Return to vault</a>
      </section>
    }
  </main>`,
  styles: `
    .item-page {
      width: min(100%, 48rem);
      margin: auto;
      padding: 1rem clamp(1rem, 4vw, 2rem) 7rem;
    }
    .item-page > header {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      margin-bottom: 1rem;
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 700;
    }
    .missing {
      display: grid;
      place-items: center;
      gap: 1rem;
      padding: 5rem 1rem;
      text-align: center;
    }
    .missing > app-icon {
      width: 2.5rem;
      height: 2.5rem;
      color: var(--text-faint);
    }
    .missing h1 {
      margin: 0;
      font-size: 1.2rem;
    }
  `,
})
export class ItemDetailsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly vault = inject(VaultStore);
  private readonly itemId = this.route.snapshot.paramMap.get('id');
  readonly item = computed(
    () => this.vault.items().find((candidate) => candidate.id === this.itemId) ?? null,
  );
  readonly backRoute = computed(() => {
    const item = this.item();
    if (item?.deletedAt) return '/vault/trash';
    if (item?.archived) return '/vault/archive';
    return '/vault/all';
  });
  async ngOnInit(): Promise<void> {
    if (!this.vault.items().length) await this.vault.load();
    const item = this.item();
    this.vault.selectedId.set(item?.id ?? null);
  }
}
