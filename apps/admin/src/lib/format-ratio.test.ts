/**
 * Unit tests for formatRatio.
 *
 * Run with: npm run test:unit --workspace=@feastpot/admin
 *
 * Uses Node.js built-in test runner (node:test) via tsx so no additional
 * test-framework dependency is needed.
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatRatio } from './format-ratio.js';

describe('formatRatio', () => {
  it('returns "No data yet" when denominator is zero', () => {
    assert.strictEqual(formatRatio(0, 0), 'No data yet');
    assert.strictEqual(formatRatio(5, 0), 'No data yet');
    assert.strictEqual(formatRatio(100, 0), 'No data yet');
  });

  it('formats a simple percentage with 1 decimal by default', () => {
    assert.strictEqual(formatRatio(1, 2), '50.0%');
    assert.strictEqual(formatRatio(1, 4), '25.0%');
    assert.strictEqual(formatRatio(3, 3), '100.0%');
  });

  it('respects the decimals argument', () => {
    assert.strictEqual(formatRatio(1, 3, 2), '33.33%');
    assert.strictEqual(formatRatio(1, 3, 0), '33%');
  });

  it('returns "No data yet" (not Infinity or NaN) for zero denominator regardless of numerator', () => {
    const result = formatRatio(0, 0);
    assert.strictEqual(result, 'No data yet');
    assert.notStrictEqual(result, 'Infinity%');
    assert.notStrictEqual(result, 'NaN%');
  });

  it('handles 0 numerator with positive denominator', () => {
    assert.strictEqual(formatRatio(0, 100), '0.0%');
  });
});
