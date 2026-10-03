const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const baselinePath = path.join(__dirname, 'coverage-baselines.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const mode = process.argv.at(-1);
if (!['unit', 'database'].includes(mode)) {
  throw new Error('Select the measured API environment: unit or database.');
}
const dimensions = ['statements', 'branches', 'functions', 'lines'];
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}
for (const app of ['api', 'web']) {
  const summary = JSON.parse(
    fs.readFileSync(path.join(root, 'apps', app, 'coverage', 'coverage-summary.json'), 'utf8'),
  );
  const measuredFiles = new Set(
    Object.keys(summary)
      .filter((key) => key !== 'total')
      .map((key) => key.replaceAll('\\', '/').split(`/apps/${app}/src/`).at(-1)),
  );
  const sourceRoot = path.join(root, 'apps', app, 'src');
  const expected = files(sourceRoot).filter((name) => {
    if (!/\.tsx?$/.test(name) || /\.(d|test|spec)\.tsx?$/.test(name)) return false;
    // Type-only modules have no runtime statements and Istanbul omits them.
    // Decide from compiler output, not a whitelist hiding uncovered files.
    const emitted = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
      fileName: name,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        removeComments: true,
      },
    }).outputText;
    return emitted.replace(/export\s*\{\s*\};?/g, '').trim().length > 0;
  });
  const missing = expected.filter(
    (name) => !measuredFiles.has(path.relative(sourceRoot, name).replaceAll('\\', '/')),
  );
  if (missing.length)
    throw new Error(
      `INCOMPLETE_COVERAGE_${app}: ${missing.map((name) => path.relative(root, name)).join(', ')}`,
    );
  const thresholds = app === 'api' ? baseline.api[mode] : baseline.web;
  for (const dimension of dimensions) {
    const actual = summary.total[dimension].pct;
    if (actual < thresholds[dimension])
      throw new Error(
        `COVERAGE_REGRESSION_${app}_${dimension}: ${actual} < ${thresholds[dimension]}`,
      );
    if (process.argv.includes('--ratchet'))
      thresholds[dimension] = Math.max(thresholds[dimension], actual);
  }
  console.log(
    `${app}: ${expected.length} production source files accounted for; all thresholds satisfied.`,
  );
}
if (process.argv.includes('--ratchet')) {
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  console.log('Baselines raised only, never lowered. Commit the updated baseline with the tests.');
}
