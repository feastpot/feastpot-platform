import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalLoad = Module._load;
const loads = [];
Module._load = function tracedLoad(name, parent, ...args) {
  if (name === 'braces') {
    loads.push({
      package: name,
      parent: parent?.filename?.replace(`${process.cwd()}/`, ''),
    });
  }
  return originalLoad.call(this, name, parent, ...args);
};

try {
  const {
    PHASE_PRODUCTION_SERVER,
    PHASE_DEVELOPMENT_SERVER,
    PHASE_PRODUCTION_BUILD,
  } = require('next/constants');
  const { default: configure } = await import('../apps/web/next.config.mjs');
  const server = await configure(PHASE_PRODUCTION_SERVER);
  const development = await configure(PHASE_DEVELOPMENT_SERVER);
  assert.equal(typeof server.webpack, 'function');
  assert.equal(typeof development.webpack, 'function');
  assert.equal(loads.length, 0, 'Serving configuration must not import vulnerable braces');

  const serverLoads = [...loads];
  const built = await configure(PHASE_PRODUCTION_BUILD);
  assert.equal(typeof built.webpack, 'function', 'Production builds must retain the PWA hook');
  assert.ok(loads.length > 0, 'The probe must detect braces in the real build tooling');
  console.log(
    JSON.stringify(
      {
        check: 'braces-config-runtime-boundary',
        evidenceScope: 'local actual-module configuration loading, not deployed runtime',
        version: require('braces/package.json').version,
        serverLoads,
        buildLoads: loads,
        config: fileURLToPath(new URL('../apps/web/next.config.mjs', import.meta.url)).replace(
          `${process.cwd()}/`,
          '',
        ),
        result: 'PASS',
      },
      null,
      2,
    ),
  );
} finally {
  Module._load = originalLoad;
}
