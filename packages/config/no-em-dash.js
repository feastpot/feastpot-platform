/**
 * Custom ESLint rule: no-em-dash
 *
 * Em dashes (U+2014) are banned from all Feastpot source code.
 * Use a pipe (|) for title separators, a comma or colon for prose
 * asides, and "to" for ranges. See CONTRIBUTING.md for the full policy.
 */
'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow em dashes (U+2014) in string literals and template expressions',
      recommended: true,
    },
    messages: {
      noEmDash:
        'Em dash is not permitted in Feastpot copy. Use a comma, pipe, or restructure the sentence.',
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string' && node.value.includes('\u2014')) {
          context.report({ node, messageId: 'noEmDash' });
        }
      },
      TemplateElement(node) {
        if (node.value.raw.includes('\u2014')) {
          context.report({ node, messageId: 'noEmDash' });
        }
      },
    };
  },
};
