import { extractOutwardCode, isValidUkPostcode, normalisePostcode } from './postcode.util';

describe('isValidUkPostcode', () => {
  it.each([
    ['SE15 4EE', true],
    ['SE154EE', true],
    ['SW1A 1AA', true],
    ['E1 6RF', true],
    ['W1A 0AX', true],
    ['GIR 0AA', true],
    ['EC1A 1BB', true],
    ['M1 1AE', true],
    ['B1 1BB', true],
    ['se15 4ee', true], // case insensitive
  ])('valid: %s', (raw, expected) => {
    expect(isValidUkPostcode(raw)).toBe(expected);
  });

  it.each([
    ['not-a-postcode', false],
    ['12345', false],
    ['ZZZZZ', false],
    ['', false],
    ['SE1', false], // missing inward code
    ['hello world', false],
  ])('invalid: %s', (raw, expected) => {
    expect(isValidUkPostcode(raw)).toBe(expected);
  });
});

describe('normalisePostcode', () => {
  it('upper-cases and inserts a single space', () => {
    expect(normalisePostcode('se154ee')).toBe('SE15 4EE');
    expect(normalisePostcode('SE154EE')).toBe('SE15 4EE');
    expect(normalisePostcode('SE15 4EE')).toBe('SE15 4EE');
    expect(normalisePostcode('SE15  4EE')).toBe('SE15 4EE');
  });

  it('handles single-letter outward codes', () => {
    expect(normalisePostcode('e16rf')).toBe('E1 6RF');
    expect(normalisePostcode('E1 6RF')).toBe('E1 6RF');
  });

  it('handles long outward codes', () => {
    expect(normalisePostcode('SW1A1AA')).toBe('SW1A 1AA');
    expect(normalisePostcode('EC1A1BB')).toBe('EC1A 1BB');
  });
});

describe('extractOutwardCode', () => {
  it('returns the first segment of a normalised postcode', () => {
    expect(extractOutwardCode('SE15 4EE')).toBe('SE15');
    expect(extractOutwardCode('SW1A 1AA')).toBe('SW1A');
    expect(extractOutwardCode('E1 6RF')).toBe('E1');
    expect(extractOutwardCode('M1 1AE')).toBe('M1');
  });

  it('returns the whole string when there is no space', () => {
    expect(extractOutwardCode('SE154EE')).toBe('SE154EE');
  });
});
