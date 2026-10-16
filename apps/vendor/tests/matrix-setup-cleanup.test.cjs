const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const ts = require('typescript');

test('failed authentication of the final matrix identity still cleans its fixture', async () => {
  const identity = { credentials: { email: 'fixture@example.invalid', password: 'fixture' } };
  const removed = [];
  let disposed = false;
  let manifestWritten = false;
  let runSetup;
  const factory = {
    create: async () => identity,
    issueAccessToken: async () => {
      throw new Error('expected authentication failure');
    },
    teardown: async (record) => removed.push(record),
    dispose: async () => {
      disposed = true;
    },
  };
  const register = Object.assign(
    (_name, run) => {
      runSetup = run;
    },
    { setTimeout() {} },
  );
  const source = readFileSync(path.join(__dirname, '../e2e/vendor-state-matrix.setup.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules = {
    'node:fs': {
      writeFileSync: () => {
        manifestWritten = true;
      },
    },
    '@playwright/test': { test: register },
    '../../../scripts/test-factory': { TestDataFactory: { fromEnvironment: () => factory } },
    './helpers/browser-access-token': {},
    './helpers/vendor-state-matrix': {
      configuredMatrixStates: () => ['V2'],
      matrixNamespace: () => 'cleanup-regression',
    },
  };
  vm.runInNewContext(compiled, {
    exports: {},
    require(name) {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  await assert.rejects(
    runSetup({ browser: { newContext: async () => ({}) } }),
    /Supabase password preflight failed/,
  );
  assert.deepEqual(removed, [identity]);
  assert.equal(disposed, true);
  assert.equal(manifestWritten, false);
});
