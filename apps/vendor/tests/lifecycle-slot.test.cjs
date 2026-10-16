const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../e2e/helpers/lifecycle-slot.ts'), 'utf8');
const exports_ = {};
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: exports_, Date, Set, Error },
);
const { lifecycleSlot } = exports_;
const availability = {
  openingDays: [1, 2, 3, 4, 5],
  slotOpenHour: 9,
  slotCloseHour: 21,
  prepLeadHours: 24,
  blackoutDates: [],
};

test('late-night runs choose open UTC hours beyond lead, skipping closed days and blackouts', () => {
  assert.equal(
    lifecycleSlot(
      { ...availability, blackoutDates: [{ date: '2026-10-20' }] },
      0,
      new Date('2026-10-16T22:50:00Z'),
    ),
    '2026-10-21T09:00:00.000Z',
  );
  assert.equal(
    lifecycleSlot(availability, 168, new Date('2026-10-16T22:50:00Z')),
    '2026-10-26T09:00:00.000Z',
  );
});

test('unavailable schedules fail explicitly rather than changing vendor rules', () => {
  for (const overrides of [{ openingDays: [] }, { slotCloseHour: 9 }]) {
    assert.throws(
      () => lifecycleSlot({ ...availability, ...overrides }, 0, new Date('2026-10-16T22:50:00Z')),
      /No lifecycle order slot found/,
    );
  }
});
