const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const exports_ = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '../e2e/helpers/fixture-order-number.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  { exports: exports_, require },
);

test('every order-contract label yields a unique identifier within the database limit', () => {
  const spec = fs.readFileSync(
    path.resolve(__dirname, '../e2e/vendor-order-contracts.spec.ts'),
    'utf8',
  );
  const labels = [...spec.matchAll(/pendingOrder\('([^']+)'/g)].map((match) => match[1]);
  assert.ok(labels.includes('ACCEPTED-CANNOT-FULFIL'));
  const seen = new Set();
  for (const label of [...labels, 'X'.repeat(1000)]) {
    for (let index = 0; index < 100; index++) {
      const number = exports_.fixtureOrderNumber(label);
      assert.ok(number.length <= 32);
      assert.ok(number.startsWith(`TF-${label.slice(0, 6)}-`));
      assert.match(number, /^TF-.{1,6}-[a-f0-9]{20}$/);
      assert.ok(!seen.has(number));
      seen.add(number);
    }
  }
});
