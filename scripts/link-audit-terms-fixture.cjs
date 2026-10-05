// Read-only CI contract fixture. Never imports or runs the database seed.
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { resolve } = require('node:path');

if (process.env.CI !== 'true') throw new Error('CI_ONLY_TERMS_FIXTURE');
const seed = readFileSync(resolve(__dirname, '../prisma/seed-terms.ts'), 'utf8');
const match = seed.match(/const V2_CONTENT = `([\s\S]*?)`;/);
if (!match) throw new Error('CANONICAL_SEED_FIXTURE_MISSING');
const terms = {
  id: '00000000-0000-4000-8000-000000000001',
  version: '2.0',
  effectiveAt: '2026-01-01T00:00:00Z',
  contentMdx: match[1],
  contentHash: createHash('sha256').update(match[1]).digest('hex'),
};
createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:3001');
  response.setHeader('Content-Type', 'application/json');
  if (
    request.method !== 'GET' ||
    url.pathname !== '/v1/terms/current' ||
    url.searchParams.get('documentType') !== 'VENDOR_TERMS'
  ) {
    response.writeHead(404).end(JSON.stringify({ error: 'No fixture for this request' }));
    return;
  }
  response.end(JSON.stringify({ data: terms }));
}).listen(3001, '127.0.0.1', () => {
  console.log('Read-only canonical terms fixture listening on 127.0.0.1:3001');
});
