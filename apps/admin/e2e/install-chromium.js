#!/usr/bin/env node
/**
 * install-chromium.js
 *
 * Replaces every Playwright-downloaded Chromium/headless-shell binary with a
 * symlink to the NixOS system Chromium (pkgs.chromium in replit.nix).
 *
 * WHY: Playwright's downloaded binaries are compiled against glibc paths that
 * don't exist on NixOS, so they crash with "libglib-2.0.so.0: cannot open
 * shared object file". The system Chromium from pkgs.chromium is correctly
 * patchelf'd and works fine. Playwright always resolves the browser path
 * through its own registry (use.executablePath in playwright.config.ts is
 * silently ignored in this bundled version), so we need to replace the actual
 * file on disk.
 *
 * This script is idempotent: if the symlink already points to the right target
 * it is left untouched. It is safe to re-run before every test invocation.
 *
 * Usage (handled by the test:e2e npm script):
 *   node e2e/install-chromium.js
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Locate the system Chromium ───────────────────────────────────────────────

let systemChromium;
try {
  systemChromium = execSync('which chromium', { encoding: 'utf8' }).trim();
} catch {
  console.error(
    'install-chromium.js: `which chromium` failed.\n' +
      'Make sure pkgs.chromium is in replit.nix deps and the Nix env is loaded.',
  );
  process.exit(1);
}

if (!systemChromium || !fs.existsSync(systemChromium)) {
  console.error(`install-chromium.js: resolved path ${systemChromium} does not exist.`);
  process.exit(1);
}

console.log(`install-chromium.js: system Chromium -> ${systemChromium}`);

// ── Locate the Playwright browser cache ─────────────────────────────────────
// Playwright resolves its cache directory differently on NixOS/Replit: it lands
// in {workspace}/.cache/ms-playwright rather than ~/.cache/ms-playwright.
// We probe candidates in priority order and use the first that exists.

function findCacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  const candidates = [
    // Replit / NixOS: workspace root
    path.join(process.cwd(), '.cache', 'ms-playwright'),
    path.join(__dirname, '..', '..', '.cache', 'ms-playwright'), // apps/admin -> workspace root
    path.join(__dirname, '..', '..', '..', '.cache', 'ms-playwright'), // safety
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const cacheDir = findCacheDir();

if (!fs.existsSync(cacheDir)) {
  console.log(
    `install-chromium.js: cache dir ${cacheDir} not found.\n` +
      'Run `npx playwright install chromium` first to create the expected directory structure.',
  );
  process.exit(0);
}

// ── Symlink every chrome / chrome-headless-shell binary found ────────────────

const BINARY_NAMES = new Set(['chrome', 'chrome-headless-shell']);
let patchCount = 0;

for (const versionDirName of fs.readdirSync(cacheDir)) {
  if (!versionDirName.startsWith('chromium')) continue;

  const versionDir = path.join(cacheDir, versionDirName);
  if (!fs.statSync(versionDir).isDirectory()) continue;

  for (const platformDirName of fs.readdirSync(versionDir)) {
    const platformDir = path.join(versionDir, platformDirName);
    if (!fs.statSync(platformDir).isDirectory()) continue;

    for (const binaryName of fs.readdirSync(platformDir)) {
      if (!BINARY_NAMES.has(binaryName)) continue;

      const binaryPath = path.join(platformDir, binaryName);
      const stat = fs.lstatSync(binaryPath);

      if (stat.isSymbolicLink()) {
        const current = fs.readlinkSync(binaryPath);
        if (current === systemChromium) {
          console.log(`install-chromium.js: already linked -> ${binaryPath}`);
          patchCount++;
          continue;
        }
        fs.unlinkSync(binaryPath);
      } else {
        const backupPath = binaryPath + '.orig';
        if (!fs.existsSync(backupPath)) {
          fs.renameSync(binaryPath, backupPath);
          console.log(`install-chromium.js: backed up original to ${backupPath}`);
        } else {
          fs.unlinkSync(binaryPath);
        }
      }

      fs.symlinkSync(systemChromium, binaryPath);
      console.log(`install-chromium.js: linked ${binaryPath} -> ${systemChromium}`);
      patchCount++;
    }
  }
}

if (patchCount === 0) {
  console.warn(
    'install-chromium.js: no chrome/chrome-headless-shell binaries found in ' +
      cacheDir +
      '.\n' +
      'Run `npx playwright install chromium` to download the browser package first.',
  );
} else {
  console.log(`install-chromium.js: done (${patchCount} binary path(s) linked).`);
}
