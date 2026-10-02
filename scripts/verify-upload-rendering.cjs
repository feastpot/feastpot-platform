/** Real shared UI components in an isolated browser bundle; no Next build or credentials. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const ts = require('typescript');
const sharp = require('sharp');
const { chromium } = require('playwright');
const wp = require('next/dist/compiled/webpack/webpack');
wp.init();

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-render-'));
  for (const name of ['safe-image', 'safe-photo', 'secure-download']) {
    const text = fs.readFileSync(`packages/ui/src/components/${name}.tsx`, 'utf8');
    fs.writeFileSync(
      path.join(dir, `${name}.js`),
      ts.transpileModule(text, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
    );
  }
  fs.writeFileSync(
    path.join(dir, 'entry.js'),
    `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {SafeImage} from './safe-image';
    import {SafePhoto} from './safe-photo';
    import {SecureImage} from './secure-download';
    const root = createRoot(document.getElementById('gallery'));
    window.renderFixture = (kind, missing) => {
      const Component = kind === 'next' ? SafeImage : kind === 'plain' ? SafePhoto : SecureImage;
      const src = missing ? '/missing.png' : '/valid.png';
      const props = kind === 'private'
        ? {url: missing ? '/denied.png' : '/private.png', token: 'fixture-session', alt: 'Uploaded fixture', className: 'thumb'}
        : {src, alt: 'Uploaded fixture', width: 24, height: 32, unoptimized: true, style: {maxWidth: '100%', height: 'auto'}, className: 'thumb'};
      if (kind === 'plain') delete props.unoptimized;
      root.render(React.createElement(Component, {...props, key: kind + missing}));
    };
  `,
  );
  await new Promise((resolve, reject) =>
    wp.webpack(
      {
        mode: 'development',
        target: 'web',
        entry: path.join(dir, 'entry.js'),
        output: { path: dir, filename: 'gallery.js' },
        resolve: { modules: [path.join(process.cwd(), 'node_modules')], extensions: ['.js'] },
        plugins: [
          new wp.webpack.DefinePlugin({
            'process.env': JSON.stringify({ NODE_ENV: 'development' }),
          }),
        ],
      },
      (error, stats) =>
        error || stats.hasErrors()
          ? reject(error ?? new Error(stats.toString({ all: false, errors: true })))
          : resolve(),
    ),
  );
  const png = await sharp({ create: { width: 24, height: 32, channels: 3, background: '#128a7c' } })
    .png()
    .toBuffer();
  let privateHeaderSeen = false;
  const server = http.createServer((request, response) => {
    if (request.url === '/gallery.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(path.join(dir, 'gallery.js')));
    } else if (request.url === '/valid.png' || request.url === '/private.png') {
      if (request.url === '/private.png') {
        privateHeaderSeen = request.headers.authorization === 'Bearer fixture-session';
        if (!privateHeaderSeen) {
          response.writeHead(403);
          response.end();
          return;
        }
      }
      response.setHeader('Content-Type', 'image/png');
      response.end(png);
    } else if (request.url === '/denied.png' || request.url === '/missing.png') {
      response.writeHead(request.url === '/denied.png' ? 403 : 404);
      response.end();
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><style>body{margin:16px}.thumb{width:24px;max-width:100%;object-fit:contain}img{height:auto}</style><main id="gallery"></main><script src="/gallery.js"></script>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error('UPLOAD_RENDER_BROWSER_ERROR', error.message));
  const results = [];
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction('typeof window.renderFixture === "function"');
    for (const width of [1280, 375])
      for (const kind of ['next', 'plain', 'private']) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((kind) => window.renderFixture(kind, false), kind);
        await page.waitForFunction(() => {
          const image = document.querySelector('img');
          return image?.complete && image.naturalWidth > 0;
        });
        const ratio = await page.evaluate(() => {
          const image = document.querySelector('img');
          const rect = image.getBoundingClientRect();
          return {
            natural: [image.naturalWidth, image.naturalHeight],
            rendered: [rect.width, rect.height],
            pass:
              Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight) < 0.01,
          };
        });
        await page.evaluate((kind) => window.renderFixture(kind, true), kind);
        await page
          .getByRole('img', {
            name:
              kind === 'private'
                ? 'Uploaded fixture: image unavailable'
                : 'Uploaded fixture unavailable',
          })
          .waitFor();
        // Wait for the failed private request too, not just its loading fallback.
        if (kind === 'private') await page.waitForTimeout(200);
        const noBrokenIcon = (await page.locator('img').count()) === 0;
        results.push({ component: kind, viewport: width, ratio, placeholder: noBrokenIcon });
        if (!ratio.pass || !noBrokenIcon) throw new Error('RENDER_ASSERTION_FAILED');
      }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  fs.mkdirSync('.local', { recursive: true });
  fs.writeFileSync(
    '.local/upload-render-results.json',
    JSON.stringify(
      {
        results,
        privateHeaderSeen,
        scope:
          'real shared components; private auth header uses harmless local fixture, not a real account',
      },
      null,
      2,
    ),
  );
  console.log(
    'UPLOAD_RENDER_SUMMARY',
    JSON.stringify({
      cases: results.length,
      pass: results.every((r) => r.ratio.pass && r.placeholder),
      privateHeaderSeen,
    }),
  );
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((error) => {
  console.error('UPLOAD_RENDER_FAILED', error.message);
  process.exitCode = 1;
});
