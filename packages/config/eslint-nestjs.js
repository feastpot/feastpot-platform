const base = require('./eslint-base.js');

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...base,
  env: {
    ...base.env,
    jest: true,
  },
  rules: {
    ...base.rules,
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
  },
};
