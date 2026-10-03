const { readFile } = require('node:fs/promises');
const path = require('node:path');

const { XMLParser, XMLValidator } = require('fast-xml-parser');

const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  isArray: (tag) => tag === 'url' || tag === 'sitemap',
});

async function loadXml(file, root) {
  const xml = await readFile(file, 'utf8');
  if (Buffer.byteLength(xml) > 50 * 1024 * 1024 || /<!DOCTYPE/i.test(xml)) {
    throw new Error(`[sitemap] Invalid XML size or document type in ${path.basename(file)}`);
  }
  if (XMLValidator.validate(xml) !== true) {
    throw new Error(`[sitemap] Malformed XML in ${path.basename(file)}`);
  }
  const document = parser.parse(xml);
  if (!document[root] || document[root]['@_xmlns'] !== NAMESPACE) {
    throw new Error(`[sitemap] Invalid ${root} namespace in ${path.basename(file)}`);
  }
  return document[root];
}

async function verifySitemap(outDir, siteUrl, requiredPaths) {
  const base = siteUrl.replace(/\/$/, '');
  const index = await loadXml(path.join(outDir, 'sitemap.xml'), 'sitemapindex');
  if (!index.sitemap?.length || index.sitemap.length > 50_000) {
    throw new Error('[sitemap] Missing or oversized sitemap index');
  }
  const files = new Set();
  const locations = new Set();
  for (const entry of index.sitemap) {
    if (typeof entry.loc !== 'string' || !entry.loc.startsWith(`${base}/`)) {
      throw new Error('[sitemap] Invalid sitemap index location');
    }
    const file = entry.loc.slice(base.length + 1);
    if (!/^sitemap-\d+\.xml$/.test(file) || files.has(file)) {
      throw new Error('[sitemap] Invalid or duplicate sitemap index entry');
    }
    files.add(file);
    const urlset = await loadXml(path.join(outDir, file), 'urlset');
    if (!urlset.url?.length || urlset.url.length > 50_000) {
      throw new Error(`[sitemap] Missing or oversized URL set in ${file}`);
    }
    for (const url of urlset.url) {
      if (
        typeof url.loc !== 'string' ||
        url.loc.length > 2048 ||
        !(url.loc === base || url.loc.startsWith(`${base}/`)) ||
        locations.has(url.loc)
      ) {
        throw new Error(`[sitemap] Invalid or duplicate profile location in ${file}`);
      }
      const parsed = new URL(url.loc);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash) {
        throw new Error(`[sitemap] Invalid absolute URL in ${file}`);
      }
      if (url.lastmod && Number.isNaN(Date.parse(url.lastmod))) {
        throw new Error(`[sitemap] Invalid modification date in ${file}`);
      }
      if (
        url.changefreq &&
        !['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(
          url.changefreq,
        )
      ) {
        throw new Error(`[sitemap] Invalid change frequency in ${file}`);
      }
      if (url.priority !== undefined && !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(url.priority)) {
        throw new Error(`[sitemap] Invalid priority in ${file}`);
      }
      locations.add(url.loc);
    }
  }
  const vendorPaths = requiredPaths.filter(({ loc }) => loc.startsWith('/vendors/'));
  if (!vendorPaths.length || requiredPaths.some(({ loc }) => !locations.has(`${base}${loc}`))) {
    throw new Error('[sitemap] Generated XML is missing required vendor or occasion URLs');
  }
  return { vendors: vendorPaths.length, files: files.size, urls: locations.size };
}

module.exports = { verifySitemap };
