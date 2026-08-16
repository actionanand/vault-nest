import { PasswordGeneratorService, type GeneratorOptions } from './password-generator.service';

describe('PasswordGeneratorService', () => {
  const service = new PasswordGeneratorService();
  const memorableOptions: GeneratorOptions = {
    mode: 'memorable',
    length: 20,
    memorableLength: 14,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: false,
    allowedSymbols: '!@#',
    connector: '-',
    substituteCharacters: false,
    useContractions: false,
    avoidAmbiguous: false,
  };

  it('distributes memorable number groups before a connector and at the end', () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const password = service.generate(memorableOptions);

      expect(password.length).toBe(memorableOptions.memorableLength);
      expect(password).toMatch(/\d+-/);
      expect(password).toMatch(/\d+$/);
      expect(password).toMatch(/[A-Z]/);
    }
  });

  it('keeps every memorable length valid when numbers are enabled', () => {
    for (let length = 6; length <= 64; length++) {
      const password = service.generate({ ...memorableOptions, memorableLength: length });

      expect(password.length).toBe(length);
      expect(password).toMatch(/\d+$/);
      if (length >= 9) expect(password).toMatch(/\d+-/);
    }
  });

  it('never truncates memorable words to reach the requested length', () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = service.generateResult({
        ...memorableOptions,
        memorableLength: 14,
        substituteCharacters: true,
        useContractions: true,
      });
      const readableWords = result.readableText?.split(' ') ?? [];

      expect(result.value.length).toBe(14);
      expect(readableWords.length).toBeGreaterThanOrEqual(2);
      expect(readableWords.every((word) => word.length >= 3)).toBe(true);
    }
  });
});
