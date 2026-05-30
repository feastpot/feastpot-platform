import { calculateServiceFee } from './service-fee';

// The platform default (in code) is 0 — a failsafe so a missing env can never
// charge an unintended fee. The live value (500 bps = 5%) is supplied via env,
// so we set it explicitly here to exercise the active-fee behaviour, then
// restore the original value afterwards.
describe('calculateServiceFee', () => {
  const original = process.env.SERVICE_FEE_BPS;

  beforeEach(() => {
    process.env.SERVICE_FEE_BPS = '500';
  });

  afterAll(() => {
    if (original === undefined) delete process.env.SERVICE_FEE_BPS;
    else process.env.SERVICE_FEE_BPS = original;
  });

  it('applies minimum on small orders', () => expect(calculateServiceFee(500)).toBe(50));
  it('applies 5% on mid-range orders', () => expect(calculateServiceFee(2500)).toBe(125));
  it('applies maximum on large orders', () => expect(calculateServiceFee(15000)).toBe(299));
  it('returns 0 when bps env is 0', () => {
    process.env.SERVICE_FEE_BPS = '0';
    expect(calculateServiceFee(2500)).toBe(0);
  });
});
