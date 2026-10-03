const { readdir, rm } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { verifySitemap } = require('./verify-sitemap.cjs');

async function generateSitemap() {
  require('@next/env').loadEnvConfig(process.cwd(), false);
  const config = require('../next-sitemap.config.js');
  const outDir = path.resolve(config.outDir || 'public');
  // Remove stale files BEFORE fetching. A failed build must not leave an older,
  // apparently valid sitemap available for verification or deployment.
  for (const file of await readdir(outDir)) {
    if (/^sitemap(?:-\d+)?\.xml$/.test(file)) await rm(path.join(outDir, file));
  }
  const requiredPaths = await config.additionalPaths(config);
  config.additionalPaths = async () => requiredPaths;

  // next-sitemap's execute() catches errors and exits successfully. Call main()
  // instead so generation failures propagate to npm postbuild and CI.
  const cliPath = path.resolve(path.dirname(require.resolve('next-sitemap')), '../esm/cli.js');
  const { CLI } = await import(pathToFileURL(cliPath).href);
  await new CLI().main();

  const result = await verifySitemap(outDir, config.siteUrl, requiredPaths);
  console.info(
    `[sitemap] Verified ${result.vendors} vendor profiles in ${result.files} sitemap file(s); XML and sitemap protocol checks passed`,
  );
}

if (require.main === module) {
  generateSitemap().catch((error) => {
    console.error(error instanceof Error ? error.message : '[sitemap] Generation failed');
    process.exitCode = 1;
  });
}

module.exports = { generateSitemap };
