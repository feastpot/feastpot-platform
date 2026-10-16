const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

function renderTerms(props) {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/app/terms/terms-client.tsx'),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const icon = () => null;
  const mocks = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    react: {
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEffect() {},
    },
    'lucide-react': {
      CheckCircle2: icon,
      Clock: icon,
      ExternalLink: icon,
      FileText: icon,
      History: icon,
    },
    '@feastpot/ui': { KeyTermsSummary: icon, RateCard: icon },
    '@feastpot/config/platform-facts': require('@feastpot/config/platform-facts'),
    '@/lib/api/client': {},
    '@/lib/auth/use-access-token': { useAccessToken: () => ({ token: null }) },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return renderToStaticMarkup(React.createElement(exports.TermsClient, props));
}

test('API changeSummary is rendered for current, pending and historical terms', () => {
  const version = (id, changeSummary, effectiveAt) => ({
    id,
    documentType: 'VENDOR_TERMS',
    version: id,
    changeSummary,
    publishedAt: '2020-01-01T00:00:00Z',
    effectiveAt,
  });
  const html = renderTerms({
    view: {
      current: {
        ...version('current', 'Current contractual changes.', '2020-01-01T00:00:00Z'),
        accepted: true,
      },
      pending: {
        ...version(
          'pending',
          'Future material test-only vendor terms version.',
          '2099-01-01T00:00:00Z',
        ),
        accepted: false,
      },
    },
    history: [
      {
        ...version('archived', 'Historical contractual changes.', '2019-01-01T00:00:00Z'),
        acceptedAt: null,
      },
    ],
  });
  assert.match(html, /Current contractual changes\./);
  assert.match(html, /Future material test-only vendor terms version\./);
  assert.match(html, /Historical contractual changes\./);
  assert.match(html, /Pending acknowledgement/);
  assert.match(html, /<button[^>]*>Acknowledge &amp; accept<\/button>/);
  assert.match(html, /<h2[^>]*id="current-terms-heading"/);
  assert.match(html, /<h2[^>]*id="pending-terms-heading"/);
});
