const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function renderGate(needsAcceptance) {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/components/layout/re-acceptance-gate.tsx'),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const states = [
    needsAcceptance,
    needsAcceptance ? { version: 'test', effectiveAt: '2020-01-01T00:00:00Z' } : null,
    false,
    false,
    false,
  ];
  const mocks = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    'next/navigation': { usePathname: () => '/payouts', useRouter: () => ({}) },
    react: {
      useState: () => [states.shift(), () => {}],
      useEffect() {},
    },
    '@/lib/api/client': {},
    '@/lib/auth/use-access-token': {
      useAccessToken: () => ({ token: 'unit-test-token', loading: false }),
    },
    '@/lib/supabase/client': {},
    '@/lib/vendor-profile-state': {},
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return exports.ReAcceptanceGate({ children: 'protected portal' });
}

test('terms overlay makes the mounted portal inert, hidden and pointer-blocked', () => {
  const tree = renderGate(true);
  const [portal, dialog] = tree.props.children;
  assert.equal(portal.props.inert, '');
  assert.equal(portal.props['aria-hidden'], true);
  assert.match(portal.props.className, /pointer-events-none/);
  assert.match(portal.props.className, /opacity-0/);
  assert.equal(portal.props.children, 'protected portal');
  assert.equal(dialog.props.role, 'dialog');
  assert.equal(dialog.props['aria-modal'], 'true');
});

test('accepted vendor retains the portal without an inert wrapper', () => {
  const tree = renderGate(false);
  assert.equal(tree.props.children, 'protected portal');
  assert.equal(tree.props.inert, undefined);
});
