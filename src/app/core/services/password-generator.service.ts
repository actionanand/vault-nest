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
  'new',
  'nimble',
  'noble',
  'ocean',
  'patient',
  'peaceful',
  'proud',
  'quick',
  'quiet',
  'rapid',
  'red',
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
  'dry',
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
  'gem',
  'glade',
  'harbor',
  'hawk',
  'hazel',
  'island',
  'jasmine',
  'key',
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
      const numberLength = options.numbers
        ? this.estimatedMemorableDigitCount(options.memorableLength)
        : 0;
      const estimatedWords = Math.max(
        2,
        Math.ceil((options.memorableLength - numberLength) / (averageWordLength + 1)),
      );
      const wordPoolSize = adjectives.length + nouns.length;
      const contractionPoolSize = this.memorableContractionPool().length;
      const numberPool = options.avoidAmbiguous ? 8 : 10;
      const bits =
        estimatedWords * Math.log2(wordPoolSize) +
        (options.numbers ? Math.log2(numberPool ** numberLength) : 0) +
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
    if (options.memorableLength < 6) {
      throw new Error('Use at least 6 characters for a memorable password.');
    }
    const connector = this.cleanConnector(options.connector);
    const { adjectives, nouns } = this.memorableWordPool(options.avoidAmbiguous);
    const contractions = this.memorableContractionPool();
    const digits = options.avoidAmbiguous ? '23456789' : '0123456789';
    const selected = this.selectMemorableWords(options, connector, adjectives, nouns, contractions);
    const readableWords = selected.words.map((word) =>
      this.styleMemorableWord(word, options.uppercase),
    );
    let passwordWords = [...readableWords];
    let digitCount = selected.digitCount;

    if (options.substituteCharacters) {
      const minimumDigits = options.numbers ? Math.min(passwordWords.length, digitCount) : 0;
      const substituted = this.applyMemorableSubstitutions(
        passwordWords.join('\u0000'),
        options.avoidAmbiguous,
        Math.max(0, digitCount - minimumDigits),
      );
      passwordWords = substituted.value.split('\u0000');
      digitCount -= substituted.expansion;
    }

    if (options.uppercase && !passwordWords.some((word) => /[A-Z]/.test(word))) {
      const wordIndex = passwordWords.findIndex((word) => /[a-z]/.test(word));
      if (wordIndex >= 0) {
        const letterIndex = passwordWords[wordIndex].search(/[a-z]/);
        const word = passwordWords[wordIndex];
        passwordWords[wordIndex] =
          word.slice(0, letterIndex) +
          word[letterIndex].toUpperCase() +
          word.slice(letterIndex + 1);
      }
    }

    const value = options.numbers
      ? this.insertMemorableNumberRuns(passwordWords, connector, digitCount, digits)
      : passwordWords.join(connector);
    if (value.length !== options.memorableLength) {
      throw new Error('A complete memorable password could not be generated at this length.');
    }
    return {
      value,
      readableText: options.substituteCharacters ? readableWords.join(' ') : null,
    };
  }

  private selectMemorableWords(
    options: GeneratorOptions,
    connector: string,
    adjectives: readonly string[],
    nouns: readonly string[],
    contractions: readonly string[],
  ): { readonly words: readonly string[]; readonly digitCount: number } {
    const digitCounts = options.numbers
      ? this.memorableDigitCandidates(options.memorableLength)
      : [0];
    const minimumWords = options.numbers
      ? options.memorableLength >= 9
        ? 2
        : 1
      : options.memorableLength >= 7
        ? 2
        : 1;

    for (const digitCount of digitCounts) {
      const words = this.findCompleteMemorableWords(
        options.memorableLength - digitCount,
        connector.length,
        minimumWords,
        options.useContractions,
        adjectives,
        nouns,
        contractions,
      );
      if (words) return { words, digitCount };
    }
    throw new Error('A complete memorable password could not be generated at this length.');
  }

  private memorableDigitCandidates(length: number): number[] {
    const minimum = length >= 12 ? 4 : length >= 9 ? 2 : 1;
    const maximum =
      length >= 12
        ? Math.min(8, Math.max(4, Math.floor(length / 3)))
        : length >= 9
          ? 3
          : Math.min(2, length - 3);
    const candidates = Array.from(
      { length: Math.max(0, maximum - minimum + 1) },
      (_, index) => minimum + index,
    );
    this.shuffle(candidates);
    return candidates;
  }

  private findCompleteMemorableWords(
    bodyLength: number,
    connectorLength: number,
    minimumWords: number,
    useContractions: boolean,
    adjectives: readonly string[],
    nouns: readonly string[],
    contractions: readonly string[],
  ): readonly string[] | null {
    const failedStates = new Set<string>();
    const maximumWords = Math.max(minimumWords, Math.ceil(bodyLength / 3));
    const search = (wordIndex: number, remaining: number): readonly string[] | null => {
      if (remaining === 0) return wordIndex >= minimumWords ? [] : null;
      if (remaining < 0 || wordIndex >= maximumWords) return null;

      const state = `${wordIndex}:${remaining}`;
      if (failedStates.has(state)) return null;
      const pool =
        useContractions && wordIndex === 0
          ? contractions
          : wordIndex % 2 === 0
            ? adjectives
            : nouns;
      const separatorLength = wordIndex === 0 ? 0 : connectorLength;
      const candidates = pool.filter((word) => word.length + separatorLength <= remaining);
      this.shuffle(candidates);
      for (const word of candidates) {
        const rest = search(wordIndex + 1, remaining - separatorLength - word.length);
        if (rest) return [word, ...rest];
      }
      failedStates.add(state);
      return null;
    };
    return search(0, bodyLength);
  }

  private estimatedMemorableDigitCount(length: number): number {
    if (length <= 7) return 1;
    if (length <= 11) return 2;
    const maximum = Math.min(8, Math.max(4, Math.floor(length / 3)));
    return Math.round((4 + maximum) / 2);
  }

  private insertMemorableNumberRuns(
    segments: readonly string[],
    connector: string,
    digitCount: number,
    digits: string,
  ): string {
    if (segments.length < 2) {
      let numberRun = '';
      while (numberRun.length < digitCount) numberRun += this.pickCharacter(digits);
      return `${segments[0]}${numberRun}`;
    }

    const groupCount = Math.min(segments.length, digitCount);
    const selectedIndexes = [0];
    if (groupCount > 1) selectedIndexes.push(segments.length - 1);
    const middleIndexes = Array.from(
      { length: Math.max(0, segments.length - 2) },
      (_, index) => index + 1,
    );
    this.shuffle(middleIndexes);
    selectedIndexes.push(...middleIndexes.slice(0, Math.max(0, groupCount - 2)));

    const groupLengths = new Map(selectedIndexes.map((index) => [index, 1]));
    let remainingDigits = digitCount - groupCount;
    while (remainingDigits > 0) {
      const index = this.pickItem(selectedIndexes);
      groupLengths.set(index, (groupLengths.get(index) ?? 0) + 1);
      remainingDigits--;
    }

    return segments
      .map((segment, index) => {
        const length = groupLengths.get(index) ?? 0;
        let numberRun = '';
        while (numberRun.length < length) numberRun += this.pickCharacter(digits);
        return `${segment}${numberRun}`;
      })
      .join(connector);
  }

  private styleMemorableWord(value: string, uppercase: boolean): string {
    const word = value.toLowerCase();
    if (!uppercase) return word;

    const characters = [...this.capitalize(word)];
    if (word.includes("'")) return characters.join('');
    const candidates = characters
      .map((character, index) => (index > 0 && /[a-z]/.test(character) ? index : -1))
      .filter((index) => index >= 0);
    this.shuffle(candidates);
    const additionalCapitals = candidates.length
      ? this.randomInt(Math.min(3, candidates.length + 1))
      : 0;
    for (const index of candidates.slice(0, additionalCapitals)) {
      characters[index] = characters[index].toUpperCase();
    }
    return characters.join('');
  }

  private cleanConnector(value: string): string {
    const trimmed = value.trim();
    const connector = this.normaliseSymbols(trimmed);
    if (connector.length !== 1 || connector !== trimmed) {
      throw new Error('Enter one punctuation character as the connector.');
    }
    return connector;
  }

  private applyMemorableSubstitutions(
    value: string,
    avoidAmbiguous: boolean,
    expansionBudget: number,
  ): { readonly value: string; readonly expansion: number } {
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
    if (!candidates.length) return { value, expansion: 0 };

    this.shuffle(candidates);
    const maximumChanges = Math.min(3, Math.max(1, Math.ceil(candidates.length / 8)));
    const changeCount = 1 + this.randomInt(maximumChanges);
    const selected = new Map<number, string>();
    let expansion = 0;
    for (const candidate of candidates) {
      const availableChoices = candidate.choices.filter(
        (choice) => choice.length - 1 <= expansionBudget - expansion,
      );
      if (!availableChoices.length) continue;
      const replacement = this.pickItem(availableChoices);
      selected.set(candidate.index, replacement);
      expansion += replacement.length - 1;
      if (selected.size >= changeCount) break;
    }
    return {
      value: characters.map((character, index) => selected.get(index) ?? character).join(''),
      expansion,
    };
  }

  private memorableContractionPool(): readonly string[] {
    return CONTRACTIONS;
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
