import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PasswordGeneratorService,
  type GeneratedPassword,
  type GeneratorMode,
  type GeneratorOptions,
} from '../../core/services/password-generator.service';
import { AppIcon } from './app-icon';

const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{}';
const CONNECTORS = ['-', '_', '.', '@', '#', ':', '/', '|', '+', '~', '='] as const;

@Component({
  selector: 'app-password-generator-dialog',
  imports: [FormsModule, AppIcon],
  templateUrl: './password-generator-dialog.html',
  styleUrl: './password-generator-dialog.scss',
  host: {
    '(document:keydown.escape)': 'cancelled.emit()',
  },
})
export class PasswordGeneratorDialog {
  private readonly generator = inject(PasswordGeneratorService);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  readonly accepted = output<GeneratedPassword>();
  readonly cancelled = output<void>();
  readonly connectors = CONNECTORS;
  readonly options = signal<GeneratorOptions>({
    mode: 'random',
    length: 20,
    memorableLength: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    allowedSymbols: DEFAULT_SYMBOLS,
    connector: '-',
    substituteCharacters: false,
    useContractions: false,
    avoidAmbiguous: true,
  });
  readonly result = signal<GeneratedPassword>({ value: '', readableText: null });
  readonly error = signal('');
  readonly isMemorable = computed(() => this.options().mode === 'memorable');
  readonly entropy = computed(() =>
    this.error() ? 0 : this.generator.estimateEntropy(this.options()),
  );
  readonly strength = computed(() => {
    const entropy = this.entropy();
    if (entropy >= 100) return 'Very strong';
    if (entropy >= 75) return 'Strong';
    if (entropy >= 50) return 'Fair';
    if (entropy >= 30) return 'Weak';
    return 'Very weak';
  });

  constructor() {
    this.regenerate();
    afterNextRender(() => this.dialog()?.nativeElement.focus());
  }

  setMode(mode: GeneratorMode): void {
    this.update('mode', mode);
  }

  update<K extends keyof GeneratorOptions>(key: K, value: GeneratorOptions[K]): void {
    this.options.update((current) => ({ ...current, [key]: value }));
    this.regenerate();
  }

  regenerate(): void {
    try {
      this.result.set(this.generator.generateResult(this.options()));
      this.error.set('');
    } catch (error: unknown) {
      this.result.set({ value: '', readableText: null });
      this.error.set(error instanceof Error ? error.message : 'Password could not be generated.');
    }
  }

  accept(): void {
    if (this.error() || !this.result().value) return;
    this.accepted.emit(this.result());
  }
}
