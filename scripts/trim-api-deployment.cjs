/**
 * API publishing snapshot only. Never run --apply in the development workspace:
 * live Next dev servers need their .next directories. Vercel builds do not use
 * this command. Source, dependencies, API output and migrations stay intact.
 */
const fs = require('node:fs');
const path = require('node:path');

const generatedPaths = Object.freeze([
  'apps/web/.next',
  'apps/vendor/.next',
  'apps/admin/.next',
  '.cache/ms-playwright',
  '.turbo',
]);

function trimDeployment(root, apply = false) {
  if (apply && !fs.existsSync(path.join(root, 'apps/api/dist/main.js'))) {
    throw new Error('Build the API before trimming the deployment snapshot');
  }
  const selected = generatedPaths.filter((relative) => fs.existsSync(path.join(root, relative)));
  if (apply) {
    for (const relative of selected) {
      fs.rmSync(path.join(root, relative), { recursive: true, force: true });
    }
  }
  return { mode: apply ? 'apply' : 'read-only', paths: selected };
}

module.exports = { trimDeployment, generatedPaths };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply')) {
    console.error('Usage: node scripts/trim-api-deployment.cjs [--apply]');
    process.exitCode = 1;
  } else {
    console.log(
      '[api-deployment-trim]',
      JSON.stringify(trimDeployment(path.resolve(__dirname, '..'), args.includes('--apply'))),
    );
  }
}
