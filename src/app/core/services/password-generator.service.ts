import { Service } from '@angular/core';

export type GeneratorMode = 'random' | 'memorable';

export interface GeneratorOptions {
  readonly mode: GeneratorMode;
  readonly length: number;
  readonly memorableLength: number;
  readonly uppercase: boolean;
  readonly lowercase: boolean;
  readonly numbers: boolean;
  readonly symbols: boolean;
  readonly allowedSymbols: string;
  readonly connector: string;
  readonly substituteCharacters: boolean;
  readonly useContractions: boolean;
  readonly avoidAmbiguous: boolean;
}

export interface GeneratedPassword {
  readonly value: string;
  readonly readableText: string | null;
}

const AMBIGUOUS_CHARACTERS = 'Il1O0o';
const ADJECTIVES = [
  'amber',
  'ancient',
  'autumn',
  'bold',
  'brave',
  'bright',
  'calm',
  'clever',
  'cloudy',
  'cool',
  'coral',
  'cosmic',
  'crisp',
  'daring',
  'eager',
  'emerald',
  'fabled',
  'fair',
  'gentle',
  'golden',
  'grand',
  'happy',
  'hidden',
  'honest',
  'jolly',
  'kind',
  'lively',
  'lucky',
  'lunar',
  'merry',
  'mighty',
  'misty',
  'modern',
  'nimble',
  'noble',
  'ocean',
  'patient',
  'peaceful',
  'proud',
  'quick',
  'quiet',
  'rapid',
  'royal',
  'ruby',
  'safe',
  'silver',
  'simple',
  'solar',
  'steady',
  'sunny',
  'swift',
  'tidy',
  'tiny',
  'tranquil',
  'true',
  'velvet',
  'vivid',
  'warm',
  'wise',
  'witty',
  'young',
  'zesty',
  'agile',
  'fresh',
] as const;
const NOUNS = [
  'anchor',
  'apple',
  'badger',
  'beacon',
  'birch',
  'breeze',
  'brook',
  'canyon',
  'cedar',
  'cloud',
  'comet',
  'coral',
  'dawn',
  'delta',
  'eagle',
  'ember',
  'falcon',
  'fern',
  'field',
  'forest',
  'fox',
  'garden',
  'glade',
  'harbor',
  'hawk',
  'hazel',
  'island',
  'jasmine',
  'lake',
  'lantern',
  'leaf',
  'lotus',
  'maple',
  'meadow',
  'moon',
  'oak',
  'oasis',
  'olive',
  'orchid',
  'otter',
  'panda',
  'pebble',
  'pine',
  'planet',
  'quartz',
  'rain',
  'reef',
  'river',
  'robin',
  'sage',
  'shore',
  'sky',
  'sparrow',
  'spring',
  'star',
  'stone',
  'summit',
  'tiger',
  'trail',
  'valley',
  'willow',
  'wind',
  'wing',
  'wolf',
] as const;
const CONTRACTIONS = [
  "i'm",
  "i'll",
  "i've",
  "we're",
  "we'll",
  "we've",
  "you're",
  "you'll",
  "you've",
  "they're",
  "they'll",
  "they've",
  "it's",
  "isn't",
  "that's",
  "there's",
  "can't",
  "couldn't",
  "don't",
  "doesn't",
  "haven't",
  "hasn't",
  "mustn't",
  "shouldn't",
  "wasn't",
  "weren't",
  "won't",
  "wouldn't",
  "let's",
] as const;

@Service()
export class PasswordGeneratorService {
  generate(options: GeneratorOptions): string {
    return this.generateResult(options).value;
  }

  generateResult(options: GeneratorOptions): GeneratedPassword {
    return options.mode === 'memorable'
      ? this.generateMemorable(options)
      : { value: this.generateRandom(options), readableText: null };
  }

  estimateEntropy(options: GeneratorOptions): number {
    if (options.mode === 'memorable') {
      const { adjectives, nouns } = this.memorableWordPool(options.avoidAmbiguous);
      const averageWordLength = 5.5;
      const numberLength = options.numbers ? 2 : 0;
      const estimatedWords = Math.max(
        2,
        Math.ceil((options.memorableLength - numberLength) / (averageWordLength + 1)),
      );
      const wordPoolSize = adjectives.length + nouns.length;
      const contractionPoolSize = this.memorableContractionPool(options.avoidAmbiguous).length;
      const numberPool = options.avoidAmbiguous ? 8 : 10;
      const bits =
        estimatedWords * Math.log2(wordPoolSize) +
        (options.numbers ? Math.log2(numberPool ** 2) : 0) +
        (options.substituteCharacters ? Math.log2(3) + 2 : 0) +
        (options.useContractions ? Math.log2(contractionPoolSize) : 0);
      return Math.round(bits);
    }

    const pool = this.randomGroups(options).join('').length;
    return pool ? Math.round(options.length * Math.log2(pool)) : 0;
  }

  entropy(password: string): number {
    const pool =
      (/[a-z]/.test(password) ? 26 : 0) +
      (/[A-Z]/.test(password) ? 26 : 0) +
      (/\d/.test(password) ? 10 : 0) +
      (/[^\w]/.test(password) ? 20 : 0);
    return pool ? Math.round(password.length * Math.log2(pool)) : 0;
  }

  normaliseSymbols(value: string): string {
    const isAsciiPunctuation = (character: string) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        (code >= 33 && code <= 47) ||
        (code >= 58 && code <= 64) ||
        (code >= 91 && code <= 96) ||
        (code >= 123 && code <= 126)
      );
    };
    return [...new Set([...value].filter(isAsciiPunctuation))].join('');
  }

  private generateRandom(options: GeneratorOptions): string {
    const groups = this.randomGroups(options);
    if (!groups.length) throw new Error('Select at least one character group.');
    if (options.length < groups.length) {
      throw new Error(`Use a length of at least ${groups.length}.`);
    }

    const result = groups.map((group) => this.pickCharacter(group));
    const pool = groups.join('');
    while (result.length < options.length) result.push(this.pickCharacter(pool));
    this.shuffle(result);
    return result.join('');
  }

  private generateMemorable(options: GeneratorOptions): GeneratedPassword {
    if (options.memorableLength < 12) {
      throw new Error('Use at least 12 characters for a memorable password.');
    }
    const connector = this.cleanConnector(options.connector);
    const { adjectives, nouns } = this.memorableWordPool(options.avoidAmbiguous);
    const contractions = this.memorableContractionPool(options.avoidAmbiguous);
    const digits = options.avoidAmbiguous ? '23456789' : '0123456789';
    const numberEnding = options.numbers
      ? `${this.pickCharacter(digits)}${this.pickCharacter(digits)}`
      : '';
    const bodyLength = options.memorableLength - numberEnding.length;
    const readableWords: string[] = [];
    let wordIndex = 0;

    while (readableWords.join(connector).length < bodyLength) {
      const useContraction = options.useContractions && wordIndex === 0;
      const pool = useContraction ? contractions : wordIndex % 2 === 0 ? adjectives : nouns;
      const word = this.pickItem(pool);
      const readableWord = options.uppercase ? this.capitalize(word) : word.toLowerCase();
      readableWords.push(readableWord);
      wordIndex++;
    }

    const readableBody = readableWords.join(connector);
    let body = readableBody.slice(0, bodyLength);
    if (body.endsWith(connector)) {
      const continuation = [...readableBody.slice(bodyLength)].find(
        (character) => character !== connector,
      );
      body = `${body.slice(0, -1)}${continuation ?? 'a'}`;
    }
    if (options.substituteCharacters) {
      body = this.applyMemorableSubstitutions(body, options.avoidAmbiguous).slice(0, bodyLength);
    }
    if (options.uppercase && !/[A-Z]/.test(body)) {
      const lowercaseIndex = body.search(/[a-z]/);
      if (lowercaseIndex >= 0) {
        body = `${body.slice(0, lowercaseIndex)}${body[lowercaseIndex].toUpperCase()}${body.slice(lowercaseIndex + 1)}`;
      }
    }
    return {
      value: `${body}${numberEnding}`,
      readableText: options.substituteCharacters
        ? `${readableWords.join(' ')}${numberEnding ? ` ${numberEnding}` : ''}`
        : null,
    };
  }

  private cleanConnector(value: string): string {
    const trimmed = value.trim();
    const connector = this.normaliseSymbols(trimmed);
    if (connector.length !== 1 || connector !== trimmed) {
      throw new Error('Enter one punctuation character as the connector.');
    }
    return connector;
  }

  private applyMemorableSubstitutions(value: string, avoidAmbiguous: boolean): string {
    const replacements: Readonly<Record<string, readonly string[]>> = {
      a: ['@', '^'],
      b: ['8', '13', 'l3'],
      c: ['('],
      d: ['1)', 'l)'],
      e: ['3'],
      f: ['1=', 'l=', '|='],
      g: ['6', '9'],
      h: ['#', '|-|'],
      i: ['!', '1', '|'],
      j: ['_|'],
      k: ['|<'],
      l: ['1', '|_'],
      m: ['/\\/\\'],
      n: ['|\\|'],
      o: ['0', '()'],
      p: ['|2'],
      q: ['0_'],
      r: ['|2'],
      s: ['$', '5'],
      t: ['7', '+'],
      u: ['|_|'],
      v: ['\\/'],
      w: ['\\/\\/'],
      x: ['><'],
      y: ['`/'],
      z: ['2'],
    };
    const characters = [...value];
    const candidates = characters
      .map((character, index) => {
        const choices = replacements[character.toLowerCase()]?.filter(
          (choice) =>
            !avoidAmbiguous || ![...choice].some((part) => AMBIGUOUS_CHARACTERS.includes(part)),
        );
        return choices?.length ? { index, choices } : null;
      })
      .filter((candidate): candidate is { index: number; choices: string[] } => !!candidate);
    if (!candidates.length) return value;

    this.shuffle(candidates);
    const maximumChanges = Math.min(3, Math.max(1, Math.ceil(candidates.length / 8)));
    const changeCount = 1 + this.randomInt(maximumChanges);
    const selected = new Map(
      candidates
        .slice(0, changeCount)
        .map((candidate) => [candidate.index, this.pickItem(candidate.choices)] as const),
    );
    return characters.map((character, index) => selected.get(index) ?? character).join('');
  }

  private memorableContractionPool(avoidAmbiguous: boolean): readonly string[] {
    if (!avoidAmbiguous) return CONTRACTIONS;
    return CONTRACTIONS.filter((contraction) => !/[ilo01]/i.test(contraction));
  }

  private memorableWordPool(avoidAmbiguous: boolean): {
    adjectives: readonly string[];
    nouns: readonly string[];
  } {
    if (!avoidAmbiguous) return { adjectives: ADJECTIVES, nouns: NOUNS };
    const isClear = (word: string) => !/[ilo01]/i.test(word);
    return { adjectives: ADJECTIVES.filter(isClear), nouns: NOUNS.filter(isClear) };
  }

  private randomGroups(options: GeneratorOptions): string[] {
    const clean = (value: string) =>
      options.avoidAmbiguous
        ? [...value].filter((character) => !AMBIGUOUS_CHARACTERS.includes(character)).join('')
        : value;
    const groups = [
      options.lowercase ? clean('abcdefghijklmnopqrstuvwxyz') : '',
      options.uppercase ? clean('ABCDEFGHIJKLMNOPQRSTUVWXYZ') : '',
      options.numbers ? clean('0123456789') : '',
      options.symbols ? this.requiredSymbols(options) : '',
    ];
    return groups.filter((group) => group.length > 0);
  }

  private requiredSymbols(options: GeneratorOptions): string {
    const symbols = this.normaliseSymbols(options.allowedSymbols);
    if (!symbols) throw new Error('Enter at least one allowed special character.');
    return symbols;
  }

  private capitalize(value: string): string {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }

  private shuffle<T>(values: T[]): void {
    for (let index = values.length - 1; index > 0; index--) {
      const target = this.randomInt(index + 1);
      [values[index], values[target]] = [values[target], values[index]];
    }
  }

  private pickCharacter(group: string): string {
    if (!group.length) throw new Error('A character group is empty.');
    return group[this.randomInt(group.length)];
  }

  private pickItem<T>(group: readonly T[]): T {
    if (!group.length) throw new Error('A character group is empty.');
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
