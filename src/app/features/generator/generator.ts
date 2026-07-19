import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PasswordGeneratorService,
  type GeneratorOptions,
} from '../../core/services/password-generator.service';
import { AppIcon } from '../../shared/components/app-icon';

@Component({
  selector: 'app-generator',
  imports: [FormsModule, AppIcon],
  templateUrl: './generator.html',
  styleUrl: './generator.scss',
})
export class Generator {
  private readonly generator = inject(PasswordGeneratorService);
  readonly options = signal<GeneratorOptions>({
    length: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    avoidAmbiguous: true,
  });
  readonly password = signal('');
  readonly copied = signal(false);
  readonly entropy = computed(() => this.generator.entropy(this.password()));
  readonly strength = computed(() =>
    this.entropy() >= 100
      ? 'Very strong'
      : this.entropy() >= 75
        ? 'Strong'
        : this.entropy() >= 50
          ? 'Fair'
          : this.entropy() >= 30
            ? 'Weak'
            : 'Very weak',
  );
  constructor() {
    this.regenerate();
  }
  update<K extends keyof GeneratorOptions>(key: K, value: GeneratorOptions[K]): void {
    this.options.update((current) => ({ ...current, [key]: value }));
    this.regenerate();
  }
  regenerate(): void {
    try {
      this.password.set(this.generator.generate(this.options()));
    } catch {
      this.password.set('Select at least one group');
    }
  }
  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.password());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1800);
  }
}
