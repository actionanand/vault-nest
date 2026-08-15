import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClipboardService } from '../../core/services/clipboard.service';
import {
  PasswordGeneratorService,
  type GeneratorMode,
  type GeneratorOptions,
} from '../../core/services/password-generator.service';
import { AppIcon } from '../../shared/components/app-icon';

const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{}';
const CONNECTOR_CHOICES = ['-', '_', '.', '@', '#', ':', '/', '|', '+', '~', '='] as const;

@Component({
  selector: 'app-generator',
  imports: [FormsModule, AppIcon],
  templateUrl: './generator.html',
  styleUrl: './generator.scss',
})
export class Generator {
  private readonly generator = inject(PasswordGeneratorService);
  private readonly clipboard = inject(ClipboardService);

  readonly options = signal<GeneratorOptions>({
    mode: 'random',
    length: 20,
    memorableLength: 28,
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
  readonly password = signal('');
  readonly readablePassword = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
  readonly symbolsEditorOpen = signal(false);
  readonly connectorEditorOpen = signal(false);
  readonly symbolDraft = signal(DEFAULT_SYMBOLS);
  readonly connectorChoices = CONNECTOR_CHOICES;
  readonly symbolDraftValid = computed(
    () => this.generator.normaliseSymbols(this.symbolDraft()).length > 0,
  );
  readonly symbolsTrigger = viewChild<ElementRef<HTMLButtonElement>>('symbolsTrigger');
  readonly symbolsInput = viewChild<ElementRef<HTMLInputElement>>('symbolsInput');
  readonly connectorTrigger = viewChild<ElementRef<HTMLButtonElement>>('connectorTrigger');
  readonly connectorDialog = viewChild<ElementRef<HTMLElement>>('connectorDialog');
  readonly isMemorable = computed(() => this.options().mode === 'memorable');
  readonly entropy = computed(() =>
    this.error() ? 0 : this.generator.estimateEntropy(this.options()),
  );
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
  readonly strengthLevel = computed(() =>
    this.error() ? 0 : Math.min(4, Math.max(1, Math.ceil(this.entropy() / 25))),
  );

  constructor() {
    this.regenerate();
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
      const result = this.generator.generateResult(this.options());
      this.password.set(result.value);
      this.readablePassword.set(result.readableText);
      this.error.set(null);
    } catch (error) {
      this.password.set('');
      this.readablePassword.set(null);
      this.error.set(error instanceof Error ? error.message : 'Password could not be generated.');
    }
  }

  restoreSymbols(): void {
    this.symbolDraft.set(DEFAULT_SYMBOLS);
  }

  openSymbolsEditor(): void {
    this.symbolDraft.set(this.options().allowedSymbols);
    this.symbolsEditorOpen.set(true);
    setTimeout(() => this.symbolsInput()?.nativeElement.focus());
  }

  closeSymbolsEditor(): void {
    this.symbolsEditorOpen.set(false);
    setTimeout(() => this.symbolsTrigger()?.nativeElement.focus());
  }

  saveSymbols(): void {
    const symbols = this.generator.normaliseSymbols(this.symbolDraft());
    if (!symbols) return;
    this.update('allowedSymbols', symbols);
    this.closeSymbolsEditor();
  }

  openConnectorEditor(): void {
    this.connectorEditorOpen.set(true);
    setTimeout(() => this.connectorDialog()?.nativeElement.focus());
  }

  closeConnectorEditor(): void {
    this.connectorEditorOpen.set(false);
    setTimeout(() => this.connectorTrigger()?.nativeElement.focus());
  }

  selectConnector(connector: string): void {
    this.update('connector', connector);
    this.closeConnectorEditor();
  }

  async copy(): Promise<void> {
    if (!this.password() || this.error()) return;
    await this.clipboard.copy(this.password(), 'Password');
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1800);
  }
}
