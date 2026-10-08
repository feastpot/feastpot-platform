const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

// Exercise the actual TypeScript implementation, not a duplicated test stub.
const filename = path.resolve(__dirname, '../src/lib/safe-redirect.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sourceModule = new Module(filename, module);
sourceModule.filename = filename;
sourceModule.paths = Module._nodeModulePaths(path.dirname(filename));
sourceModule._compile(compiled, filename);
const { safeRedirect } = sourceModule.exports;

test('keeps valid vendor destinations, including queries and fragments', () => {
  for (const value of ['/orders', '/settings/profile', '/menu?tab=draft', '/orders#history']) {
    assert.equal(safeRedirect(value), value);
  }
});

test('uses the default destination for missing input', () => {
  assert.equal(safeRedirect(null), '/orders');
  assert.equal(safeRedirect(''), '/orders');
});

test('refuses external, protocol-relative and script destinations', () => {
  for (const value of ['https://example.org', '//example.org', 'javascript:alert(1)', 'orders']) {
    assert.equal(safeRedirect(value), '/orders');
  }
});

test('refuses path traversal and browser-normalised backslashes', () => {
  for (const value of ['/../admin', '/orders/../../admin', '/\\example.org', '/orders\\admin']) {
    assert.equal(safeRedirect(value), '/orders');
  }
});

test('enforces the documented maximum length', () => {
  const maximum = `/${'x'.repeat(199)}`;
  assert.equal(safeRedirect(maximum), maximum);
  assert.equal(safeRedirect(`${maximum}x`), '/orders');
});

test('preserves the caller-selected safe fallback', () => {
  assert.equal(safeRedirect(null, '/onboarding'), '/onboarding');
  assert.equal(safeRedirect('//example.org', '/auth/reset/update'), '/auth/reset/update');
});
