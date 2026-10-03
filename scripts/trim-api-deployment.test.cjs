const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trimDeployment, generatedPaths } = require('./trim-api-deployment.cjs');

const requiredPaths = [
  'apps/api/dist/main.js',
  'apps/api/src/main.ts',
  'apps/web/src/app/page.tsx',
  'node_modules/.prisma/client/index.js',
  'prisma/schema.prisma',
  'prisma/migrations/example/migration.sql',
  'scripts/db-deploy.sh',
  'scripts/activate-storage-auth-hook.sql',
  'attached_assets/example.png',
  '.git/config',
  '.local/state/example',
];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-deployment-trim-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of [
    ...requiredPaths,
    ...generatedPaths.map((directory) => `${directory}/generated-output`),
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'fixture');
  }
  return root;
}

test('default inspection changes nothing', (t) => {
  const root = fixture(t);
  assert.equal(trimDeployment(root).mode, 'read-only');
  for (const directory of generatedPaths) assert(fs.existsSync(path.join(root, directory)));
});

test('publish cleanup removes only the fixed generated paths', (t) => {
  const root = fixture(t);
  trimDeployment(root, true);
  for (const directory of generatedPaths) assert(!fs.existsSync(path.join(root, directory)));
  for (const file of requiredPaths) assert(fs.existsSync(path.join(root, file)), file);
  assert.deepEqual(trimDeployment(root, true).paths, []);
});

test('refuses apply before a successful API build', (t) => {
  const root = fixture(t);
  fs.unlinkSync(path.join(root, 'apps/api/dist/main.js'));
  assert.throws(() => trimDeployment(root, true), /Build the API/);
  for (const directory of generatedPaths) assert(fs.existsSync(path.join(root, directory)));
});
