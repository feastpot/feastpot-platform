/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  settings: {
    'import/resolver': {
      typescript: { alwaysTryTypes: true },
      node: true,
    },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    // Enforce strict equality everywhere EXCEPT the `x == null` /  `x != null`
    // idiom, which intentionally matches both null and undefined in one check.
    // Rewriting those to `===` would change behaviour, so allow them.
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-unresolved': 'off',
    // Em dash (U+2014) is banned from all Feastpot copy.
    // Use a pipe for title separators, a comma/colon for prose asides.
    // See CONTRIBUTING.md § "Typography rules".
    'no-restricted-syntax': [
      'error',
      {
        selector: 'Literal[value=/\u2014/]',
        message:
          'Em dash (\u2014) is not permitted in Feastpot copy. Use a comma, pipe, or restructure the sentence. See CONTRIBUTING.md.',
      },
      {
        selector: 'TemplateElement[value.raw=/\u2014/]',
        message:
          'Em dash (\u2014) is not permitted in Feastpot copy. Use a comma, pipe, or restructure the sentence. See CONTRIBUTING.md.',
      },
    ],
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    '.next',
    '.turbo',
    'coverage',
    '*.config.js',
    '*.config.ts',
    '*.config.mjs',
  ],
};
