import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BrandMark } from '../../shared/components/brand-mark';
import { AuthStore } from '../../core/services/auth.store';

@Component({
  selector: 'app-startup',
  imports: [BrandMark],
  template: `<main class="startup">
    <app-brand-mark />
    <p>Opening your private vault…</p>
    <span class="loader" aria-label="Loading"></span>
  </main>`,
  styles: `
    .startup {
      display: grid;
      min-height: 100dvh;
      place-content: center;
      justify-items: center;
      gap: 1.25rem;
    }
    .startup p {
      margin: 0;
      color: var(--text-muted);
    }
    .loader {
      width: 1.75rem;
      height: 1.75rem;
      border: 3px solid var(--border);
      border-top-color: var(--accent-strong);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class Startup implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  async ngOnInit(): Promise<void> {
    await this.auth.initialise();
    await this.router.navigateByUrl(
      this.auth.status() === 'NEEDS_SETUP'
        ? '/setup'
        : this.auth.status() === 'LOCKED'
          ? '/unlock'
          : '/vault',
    );
  }
}
