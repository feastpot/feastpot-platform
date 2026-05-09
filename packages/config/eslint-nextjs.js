const base = require('./eslint-base.js');

/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...base,
  extends: [...base.extends, 'next/core-web-vitals'],
  rules: {
    ...base.rules,
    '@next/next/no-html-link-for-pages': 'off',
    'react/no-unescaped-entities': 'off',
  },
};
