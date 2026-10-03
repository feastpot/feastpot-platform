import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkEmDashes, extensions, historicalMigrations } from './no-em-dash.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const command = fileURLToPath(new URL('./no-em-dash.mjs', import.meta.url));
const forbidden = String.fromCodePoint(0x2014);

function fixture(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'feastpot-typography-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const extension of extensions) {
  test(`committed ${extension} violates the exact CI command even with hooks bypassed`, () => {
    fixture((root) => {
      const file = `probe${extension}`;
      writeFileSync(path.join(root, file), `Deliberate negative typography probe ${forbidden}\n`);
      execFileSync('git', ['add', file], { cwd: root });
      execFileSync(
        'git',
        [
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'user.name=Typography regression',
          '-c',
          'user.email=typography@example.invalid',
          'commit',
          '-q',
          '-m',
          'Deliberately bypass local hook',
        ],
        { cwd: root },
      );
      const result = spawnSync(process.execPath, [command], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`${file}:1:`));
    });
  });
}

test('every workspace and its own documentation are checked', () => {
  fixture((root) => {
    const files = [
      'apps/api/src/probe.ts',
      'apps/web/src/probe.tsx',
      'apps/vendor/docs/probe.md',
      'apps/admin/audit/probe.txt',
      'packages/ui/probe.jsx',
      'packages/config/probe.js',
      'packages/types/probe.ts',
    ];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), forbidden);
    }
    assert.equal(checkEmDashes(root).violations.length, files.length);
  });
});

test('root-level operator reports and agent/uploaded content retain their exemptions', () => {
  fixture((root) => {
    for (const directory of ['docs', 'audit', '.agents', '.local', 'attached_assets']) {
      mkdirSync(path.join(root, directory));
      writeFileSync(path.join(root, directory, 'report.md'), forbidden);
    }
    writeFileSync(path.join(root, 'clean.txt'), 'An approved - alternative.\n');
    assert.deepEqual(checkEmDashes(root), { checked: 1, violations: [] });
    assert.equal(spawnSync(process.execPath, [command], { cwd: root }).status, 0);
  });
});

test('historical migration exceptions require byte-identical snapshots', () => {
  fixture((root) => {
    for (const file of Object.keys(historicalMigrations)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      copyFileSync(path.join(repository, file), path.join(root, file));
    }
    assert.equal(checkEmDashes(root).violations.length, 0);
    const file = Object.keys(historicalMigrations)[0];
    writeFileSync(path.join(root, file), `-- Changed migration ${forbidden}\n`);
    assert.equal(checkEmDashes(root).violations.length, 1);
    const fresh = 'prisma/migrations/new/migration.sql';
    mkdirSync(path.dirname(path.join(root, fresh)), { recursive: true });
    writeFileSync(path.join(root, fresh), `-- New migration ${forbidden}\n`);
    assert.equal(checkEmDashes(root).violations.length, 2);
  });
});

test('a scan failure is not silently treated as success', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'feastpot-typography-error-'));
  try {
    assert.notEqual(spawnSync(process.execPath, [command], { cwd: root }).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
