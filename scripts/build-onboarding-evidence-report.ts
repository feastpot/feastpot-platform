import { readFileSync, writeFileSync } from 'node:fs';

const dir = '.local/fx03-production-proof';
const matrix = JSON.parse(readFileSync(`${dir}/upload-matrix.json`, 'utf8'));
const baseline = JSON.parse(readFileSync(`${dir}/production-baseline.json`, 'utf8'));
const journey = JSON.parse(readFileSync(`${dir}/production-journey.json`, 'utf8'));
const cleanup = JSON.parse(readFileSync(`${dir}/upload-cleanup.json`, 'utf8'));
const status = readFileSync(`${dir}/status.md`, 'utf8');
const escape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const table = (headers: string[], rows: unknown[][]) =>
  `<div class="table"><table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const phoneFiles = [
  ['Before acceptance', `${dir}/1-mobile-welcome.jpg`],
  ['Current terms', `${dir}/2-mobile-terms.jpg`],
  ['After genuine terms acceptance, not ready', `${dir}/3-mobile-after-terms.jpg`],
  ['Menu screen', `${dir}/6-mobile-menu.jpg`],
  ['Delivery settings', `${dir}/8-mobile-delivery.jpg`],
];
const phones = phoneFiles
  .map(
    ([label, file]) =>
      `<figure><figcaption>${escape(label)}</figcaption><img alt="${escape(label)}" src="data:image/jpeg;base64,${readFileSync(file!).toString('base64')}"></figure>`,
  )
  .join('');
const html = `<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live onboarding and upload evidence</title><style>
body{font:15px/1.55 system-ui,sans-serif;color:#17252a;margin:0;background:#f6f8f8}main{max-width:1100px;margin:auto;padding:28px}h1{font-size:30px;line-height:1.15}h2{margin-top:32px}section{padding:20px;background:white;border:1px solid #dbe3e5;border-radius:8px;margin:18px 0}.warning{border-left:5px solid #ac452f}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:9px;border-bottom:1px solid #dbe3e5;vertical-align:top}th{background:#edf3f3}.phones{display:flex;gap:18px;overflow:auto;align-items:flex-start}figure{flex:0 0 250px;margin:0}figure img{width:250px;height:auto;border:1px solid #dbe3e5}figcaption{min-height:48px;font-size:13px;font-weight:600}pre{white-space:pre-wrap;word-break:break-word;font:13px/1.55 ui-monospace,monospace}.muted{color:#50656c}code{word-break:break-all}</style><main>
<p class="muted">Feastpot | Production evidence | 5 October 2026</p><h1>Live onboarding and upload evidence</h1>
<section class="warning"><h2>Not complete and not certified ready to trade</h2><p>63 format cases returned the expected accept/reject result, with stored objects inspected. However all seven raw JPEG ingestion tests retained EXIF and unrotated pixels. The application preview remained valid for 30 days. Prepared fixes still require API publication and a separate vendor frontend release.</p><p>No genuine KYC, completed live Connect, verified compliance, physical iPhone Safari, independently isolated gate tests or successful ready-to-trade journey is claimed.</p></section>
<section><h2>What the browser matrix proves</h2><p>Chromium ${escape(matrix.browser)}, live production API, vendor-portal origin, real bearer sessions and multipart requests. HEIC/client preparation ran in a separate browser harness using workspace code. This is API/storage evidence, not proof that every live frontend upload control serves the pending changes.</p>${table(
  ['Path', 'Input', 'Expected', 'HTTP', 'Result', 'Stored pixels', 'Stored EXIF'],
  matrix.matrix.map((r: any) => [
    r.path,
    r.format,
    r.expected,
    r.http,
    r.pass ? 'Expected response' : 'Failure',
    r.storedPixels?.join(' x '),
    r.hasExif,
  ]),
)}</section>
<section class="warning"><h2>Unmodified JPEG ingestion: seven failures</h2><p>Each source was a genuine orientation-6 16x10 JPEG, sent without client preparation. Required stored result: 10x16 pixels with EXIF removed.</p>${table(
  ['Path', 'HTTP', 'Stored pixels', 'Orientation', 'EXIF present', 'Normalised'],
  matrix.rawIngestion.map((r: any) => [
    r.path,
    r.http,
    r.storedPixels?.join(' x '),
    r.exifOrientation,
    r.hasExif,
    r.rotationAndStripPass,
  ]),
)}</section>
<section><h2>Private access checks</h2>${table(
  ['Path', 'Actor', 'HTTP', 'Expected result'],
  matrix.privacy.map((r: any) => [r.path, r.actor, r.http, r.pass]),
)}<p>Application signed URL lifetime: <strong>${escape(cleanup.applicationSignedLifetimeSeconds)} seconds (30 days)</strong>. The prepared replacement is five minutes, not yet verified live.</p></section>
<section><h2>Storage removal</h2><p>Eight replacement checks physically removed superseded application-photo/logo objects. The existing compliance DELETE returned ${escape(cleanup.productComplianceDelete.http)}; listings changed from present to absent. After approved bounded cleanup, all 39 manifest objects were absent, including prior replacements. Direct SDK fixture cleanup does not prove seven product delete/replace interfaces.</p><p>No real account, order, payment or queue was deleted or replayed. Payment rows for the cancelled £0 order: ${escape(cleanup.paymentRows)}. Stripe account created: ${escape(cleanup.stripeAccountCreated)}.</p></section>
<section><h2>375px live screenshot sequence</h2><p>This starts at an approved, unpublished synthetic vendor. It does not prove application review, real notification delivery, genuine compliance or ready-to-trade completion.</p><div class="phones">${phones}</div></section>
<section><h2>Terms and readiness</h2><p>Genuine browser scroll and click-wrap acceptance at ${escape(baseline.termsAudit.acceptedAt)}. IP and user-agent are present in the private audit; their values are deliberately omitted here. Canonical content hash match: ${escape(cleanup.termsHashMatchesCanonical)}.</p><p><code>${escape(baseline.termsAudit.contentHash)}</code></p><p>Readiness remained false after terms acceptance. This combined missing-evidence state is not eight independently isolated publication-refusal tests.</p></section>
<section><h2>Other live route observations</h2>${table(
  ['Requested', 'Served', 'Headings'],
  journey.journeyPages.map((r: any) => [r.requested, r.served, r.headings.join('; ')]),
)}<p>The unready fixture did not render a QR. Visibility within five seconds remains unverified. Harmless menu-import fixtures had no menu candidates and finished with EXTRACTION_FAILED; OCR success and bulk allergen apply are not certified.</p></section>
<section><h2>Full status and remaining work</h2><pre>${escape(status)}</pre></section></main></html>`;
writeFileSync(`${dir}/onboarding-evidence.html`, html);
console.log('EVIDENCE_REPORT_WRITTEN');
