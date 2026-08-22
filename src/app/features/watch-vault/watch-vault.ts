import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { VaultItem } from '../../core/models/vault.models';
import { WatchVaultService } from '../../core/services/watch-vault.service';
import { AppIcon } from '../../shared/components/app-icon';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog';

@Component({
  selector: 'app-watch-vault',
  imports: [DatePipe, FormsModule, RouterLink, AppIcon, ConfirmationDialog],
  templateUrl: './watch-vault.html',
  styleUrl: './watch-vault.scss',
  host: { '(document:keydown.escape)': 'closeOverlays()' },
})
export class WatchVault implements OnInit {
  readonly watchVault = inject(WatchVaultService);
  readonly selectorOpen = signal(false);
  readonly clearOpen = signal(false);
  readonly resetOpen = signal(false);
  readonly query = signal('');
  readonly localMessage = signal('');
  readonly filteredItems = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.watchVault
      .availableItems()
      .filter((item) => !query || item.title.toLocaleLowerCase().includes(query));
  });

  async ngOnInit(): Promise<void> {
    await this.watchVault.initialise();
  }

  async add(item: VaultItem): Promise<void> {
    this.localMessage.set('');
    try {
      await this.watchVault.add(item);
      this.localMessage.set(`${item.title} added to Watch Vault.`);
      if (this.watchVault.selections.entryIds().length >= this.watchVault.selections.maxEntries) {
        this.selectorOpen.set(false);
      }
    } catch (error: unknown) {
      this.localMessage.set(
        error instanceof Error ? error.message : 'Password could not be added.',
      );
    }
  }

  async remove(item: VaultItem): Promise<void> {
    const synced = await this.watchVault.remove(item.id);
    this.localMessage.set(
      synced
        ? `${item.title} was removed from the phone selection and synchronized to the watch.`
        : `${item.title} was removed locally. ${this.watchVault.message()}`,
    );
  }

  openSelector(): void {
    if (!this.watchVault.selections.integrationEnabled()) {
      this.localMessage.set('Enable Wear OS integration in Settings before adding credentials.');
      return;
    }
    if (this.watchVault.selections.entryIds().length >= this.watchVault.selections.maxEntries) {
      this.localMessage.set('Watch Vault is full. Remove one password before adding another.');
      return;
    }
    this.query.set('');
    this.selectorOpen.set(true);
  }

  closeOverlays(): void {
    this.selectorOpen.set(false);
    this.clearOpen.set(false);
    this.resetOpen.set(false);
  }

  async confirmClear(): Promise<void> {
    await this.watchVault.clearWatch();
    this.clearOpen.set(false);
  }

  async confirmReset(): Promise<void> {
    await this.watchVault.resetPairing();
    this.resetOpen.set(false);
  }
}
