const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, mocks, globals = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
    ...globals,
  });
  return exports;
}

function countdownHarness() {
  let now = 100_000;
  let state;
  let reference;
  let effect;
  let interval;
  const hook = load(
    '../src/hooks/use-countdown.ts',
    {
      react: {
        useState(initial) {
          if (state === undefined) state = initial();
          return [
            state,
            (value) => {
              state = value;
            },
          ];
        },
        useRef(initial) {
          reference ??= { current: initial };
          return reference;
        },
        useEffect(callback) {
          effect = callback;
        },
      },
    },
    {
      Date: class extends Date {
        static now() {
          return now;
        }
      },
      setInterval(callback) {
        interval = callback;
        return 1;
      },
      clearInterval() {},
    },
  );
  return {
    render(deadline, callback) {
      hook.useCountdown(deadline, callback);
      return effect();
    },
    tick(time) {
      now = time;
      interval();
    },
    remaining: () => state,
  };
}

test('an already-expired order fires once, including effect replay and callback rerenders', () => {
  const harness = countdownHarness();
  let calls = 0;
  const cleanup = harness.render('1970-01-01T00:01:00Z', () => calls++);
  cleanup();
  harness.render('1970-01-01T00:01:00Z', () => calls++);
  harness.tick(101_000);
  assert.equal(calls, 1);
  assert.equal(harness.remaining(), 0);
});

test('future expiry fires once, and a new deadline can expire independently', () => {
  const harness = countdownHarness();
  let calls = 0;
  harness.render('1970-01-01T00:01:42Z', () => calls++);
  assert.equal(calls, 0);
  harness.tick(102_000);
  harness.tick(103_000);
  assert.equal(calls, 1);
  harness.render('1970-01-01T00:01:44Z', () => calls++);
  harness.tick(104_000);
  assert.equal(calls, 2);
});

test('missing or invalid deadlines never reject an order', () => {
  const harness = countdownHarness();
  let calls = 0;
  harness.render(null, () => calls++);
  harness.render('invalid', () => calls++);
  assert.equal(calls, 0);
});

function sessionHarness(refresh, missing = false) {
  let cookies = [{ name: 'sb-test-auth-token.0', value: 'old' }];
  let written = [];
  const page = {
    url: () => 'http://vendor.example.test/menu',
    context: () => ({
      cookies: async () => cookies,
      addCookies: async (values) => {
        written = values;
        cookies = values;
      },
    }),
  };
  const implementation = load(
    '../e2e/helpers/browser-access-token.ts',
    {
      '@supabase/ssr': {
        createServerClient(_url, _key, options) {
          return {
            auth: {
              getSession: async () => {
                assert.equal((await options.cookies.getAll())[0].value, 'old');
                if (refresh)
                  await options.cookies.setAll([
                    {
                      name: 'sb-test-auth-token.0',
                      value: 'new-0',
                      options: { path: '/', sameSite: 'lax', maxAge: 3600 },
                    },
                    {
                      name: 'sb-test-auth-token.1',
                      value: 'new-1',
                      options: { path: '/', sameSite: 'lax', maxAge: 3600 },
                    },
                    { name: 'sb-test-auth-token.2', value: '', options: { path: '/', maxAge: 0 } },
                  ]);
                return {
                  data: { session: missing ? null : { access_token: 'real-browser-token' } },
                  error: null,
                };
              },
            },
          };
        },
      },
    },
    {
      URL,
      Date,
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key',
        },
      },
    },
  );
  return { run: () => implementation.browserAccessToken(page), written: () => written };
}

test('browser session refresh persists all chunks and expires stale chunks in the same context', async () => {
  const harness = sessionHarness(true);
  assert.equal(await harness.run(), 'real-browser-token');
  assert.equal(harness.written().length, 3);
  assert.equal(harness.written()[0].domain, 'vendor.example.test');
  assert.equal(harness.written()[0].sameSite, 'Lax');
  assert.equal(harness.written()[2].expires, 1);
});

test('valid browser tokens need no cookie replacement; absent sessions fail closed', async () => {
  const valid = sessionHarness(false);
  assert.equal(await valid.run(), 'real-browser-token');
  assert.equal(valid.written().length, 0);
  await assert.rejects(sessionHarness(false, true).run(), /no valid SSR cookie session/);
});
