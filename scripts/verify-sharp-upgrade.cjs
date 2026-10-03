/** Harmless native codec regressions through Next's actual optimiser pipeline. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sharp = require('sharp');
const { defaultConfig } = require('next/dist/server/config-shared');
const { imageOptimizer, canDecodeAvif } = require('next/dist/server/image-optimizer');

(async () => {
  assert.equal(sharp.versions.sharp, '0.35.5');
  assert.equal(require('next/package.json').version, '15.5.25');
  const create = () =>
    sharp({ create: { width: 32, height: 24, channels: 3, background: '#128a7c' } });
  // Build harmless fixtures before Next restricts the available input loaders.
  const fixtures = [
    ['jpeg', await create().jpeg().toBuffer(), 12],
    ['png', await create().png().toBuffer(), 12],
    ['webp', await create().webp().toBuffer(), 12],
    ['gif', await create().gif().toBuffer(), 12],
    ['tiff', await create().tiff().toBuffer(), 12],
    ['avif', await create().avif().toBuffer(), 12],
    ['oriented-jpeg', await create().withMetadata({ orientation: 6 }).jpeg().toBuffer(), 21],
    ['cmyk-jpeg', await create().toColourspace('cmyk').jpeg().toBuffer(), 12],
  ];
  assert.equal(canDecodeAvif(), true, 'Patched libheif must pass Next AVIF decode gate');
  const results = [];
  for (const [input, buffer, height] of fixtures) {
    for (const mimeType of ['image/webp', 'image/avif']) {
      const result = await imageOptimizer(
        { buffer, etag: input, cacheControl: 'max-age=0' },
        { href: `fixture.${input}`, width: 16, quality: 75, mimeType },
        defaultConfig,
        { isDev: false, silent: true },
      );
      assert.equal(
        result.error,
        undefined,
        'Original-image fallback is not a successful optimisation',
      );
      const metadata = await sharp(result.buffer).metadata();
      assert.equal(result.contentType, mimeType);
      assert.equal(metadata.width, 16);
      assert.equal(metadata.height, height);
      assert.equal(metadata.orientation, undefined);
      assert.equal(metadata.format, mimeType === 'image/webp' ? 'webp' : 'heif');
      results.push({
        input,
        output: mimeType,
        width: metadata.width,
        height: metadata.height,
        pass: true,
      });
    }
  }
  for (const [name, buffer] of [
    ['invalid', Buffer.from('not an image')],
    ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
  ]) {
    await assert.rejects(
      imageOptimizer(
        { buffer, etag: name, cacheControl: '' },
        { href: `fixture.${name}`, width: 16, quality: 75, mimeType: 'image/webp' },
        defaultConfig,
        { isDev: false, silent: true },
      ),
      (error) => error.statusCode === 400,
    );
    results.push({ input: name, expected: 'reject', pass: true });
  }
  fs.mkdirSync('.local', { recursive: true });
  fs.writeFileSync(
    '.local/sharp-upgrade-results.json',
    JSON.stringify({ at: new Date().toISOString(), versions: sharp.versions, results }, null, 2),
  );
  console.log(
    'SHARP_UPGRADE_SUMMARY',
    JSON.stringify({
      cases: results.length,
      passed: results.length,
      sharp: sharp.versions.sharp,
      vips: sharp.versions.vips,
      heif: sharp.versions.heif,
    }),
  );
})().catch((error) => {
  console.error('SHARP_UPGRADE_FAILED', error.message);
  process.exitCode = 1;
});
