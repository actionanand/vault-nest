import { inject, Service } from '@angular/core';
import { PasswordGeneratorService } from './password-generator.service';

export interface PasswordStrength {
  readonly label: 'Enter a password' | 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong';
  readonly crackTime: string;
  readonly score: number;
  readonly entropy: number;
}

@Service()
export class PasswordStrengthService {
  private readonly generator = inject(PasswordGeneratorService);

  analyse(value: string): PasswordStrength {
    if (!value) {
      return { label: 'Enter a password', crackTime: 'Not estimated', score: 0, entropy: 0 };
    }
    const entropy = this.generator.entropy(value);
    const score = Math.min(4, Math.max(1, Math.ceil(entropy / 25)));
    const label =
      entropy >= 100
        ? 'Very strong'
        : entropy >= 75
          ? 'Strong'
          : entropy >= 50
            ? 'Fair'
            : entropy >= 30
              ? 'Weak'
              : 'Very weak';
    const seconds = 2 ** Math.min(entropy, 1024) / 10_000_000_000;
    return { label, crackTime: this.formatDuration(seconds), score, entropy };
  }

  private formatDuration(seconds: number): string {
    if (seconds < 1) return 'Instantly crackable';
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`;
    if (seconds < 3_600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86_400) return `${Math.round(seconds / 3_600)} hours`;
    if (seconds < 31_536_000) return `${Math.round(seconds / 86_400)} days`;
    const years = seconds / 31_536_000;
    if (years < 100) return `${Math.round(years)} years`;
    if (years < 1_000) return 'Centuries';
    if (years < 1_000_000) return 'Thousands of years';
    return 'Millions of years';
  }
}
