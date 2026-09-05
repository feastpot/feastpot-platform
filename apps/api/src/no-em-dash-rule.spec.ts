import { Linter } from 'eslint';

import noEmDashRule = require('../../../packages/config/no-em-dash');

const rule: import('eslint').Rule.RuleModule = noEmDashRule;

describe('no-em-dash ESLint rule', () => {
  const verify = (source: string) => {
    const linter = new Linter();
    linter.defineRule('no-em-dash', rule);
    return linter.verify(source, {
      parserOptions: { ecmaVersion: 2022 },
      rules: { 'no-em-dash': 'error' },
    });
  };

  it('rejects an em dash without placing one in a source fixture', () => {
    const prohibitedCharacter = String.fromCodePoint(0x2014);

    expect(verify(`const copy = "Before${prohibitedCharacter}after";`)).toEqual([
      expect.objectContaining({ messageId: 'noEmDash' }),
    ]);
  });

  it('accepts approved punctuation', () => {
    expect(verify('const copy = "Title | detail, then: more - still valid.";')).toEqual([]);
  });
});
