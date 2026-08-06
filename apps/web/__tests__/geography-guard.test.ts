/**
 * Geography guard - ensures no literal 'London' string appears in
 * apps/web/src except in src/config/geography.ts (where LAUNCH_FOCUS.city
 * is the single source of truth).
 *
 * How to fix a failure: replace the literal with a reference to
 * LAUNCH_FOCUS.city from '@/config/geography'.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../src');
const ALLOWED_FILE = path.resolve(SRC_ROOT, 'config/geography.ts');

/** Recursively collect all .ts / .tsx files under a directory. */
function collectFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('Geography guard', () => {
  it("no file in apps/web/src contains the literal string 'London' except src/config/geography.ts", () => {
    const files = collectFiles(SRC_ROOT).filter((f) => f !== ALLOWED_FILE);
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      // Split into lines so we can report the exact offending line number.
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('London')) {
          violations.push(`${path.relative(SRC_ROOT, file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    if (violations.length > 0) {
      // Print each violation so the developer can fix it quickly.
      console.error(
        "\nLiteral 'London' found outside geography.ts:\n" + violations.join('\n') + '\n',
      );
    }

    expect(violations).toHaveLength(0);
  });
});
