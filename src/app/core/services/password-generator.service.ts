import { Service } from '@angular/core';

export interface GeneratorOptions {
  readonly length: number;
  readonly uppercase: boolean;
  readonly lowercase: boolean;
  readonly numbers: boolean;
  readonly symbols: boolean;
  readonly avoidAmbiguous: boolean;
}

@Service()
export class PasswordGeneratorService {
  generate(options: GeneratorOptions): string {
    const groups = [
      options.lowercase ? 'abcdefghijklmnopqrstuvwxyz' : '',
      options.uppercase ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '',
      options.numbers ? '0123456789' : '',
      options.symbols ? '!@#$%^&*()-_=+[]{}' : '',
    ].filter(Boolean);
    if (!groups.length) throw new Error('Select at least one character group.');
    const clean = (value: string) =>
      options.avoidAmbiguous
        ? [...value].filter((character) => !'Il1O0o'.includes(character)).join('')
        : value;
    const available = groups.map(clean);
    const result = available.map((group) => this.pick(group));
    while (result.length < options.length) result.push(this.pick(available.join('')));
    for (let index = result.length - 1; index > 0; index--) {
      const target = this.randomInt(index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result.slice(0, options.length).join('');
  }
  entropy(password: string): number {
    const pool =
      (/[a-z]/.test(password) ? 26 : 0) +
      (/[A-Z]/.test(password) ? 26 : 0) +
      (/\d/.test(password) ? 10 : 0) +
      (/[^\w]/.test(password) ? 20 : 0);
    return pool ? Math.round(password.length * Math.log2(pool)) : 0;
  }
  private pick(group: string): string {
    return group[this.randomInt(group.length)];
  }
  private randomInt(max: number): number {
    if (max <= 0) throw new Error('A character group is empty.');
    const range = 0x1_0000_0000;
    const limit = range - (range % max);
    const value = new Uint32Array(1);
    do crypto.getRandomValues(value);
    while (value[0] >= limit);
    return value[0] % max;
  }
}
