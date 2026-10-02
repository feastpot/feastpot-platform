# Dependency risk note

Assessment date: 3 October 2026. Scope: workspace dependencies and the seven LR-06 upload paths. This is not a production security clearance.

## Outcome

Safe fixes are installed and locked. Nest remains on **11.x**, Next on **15.5.25**, Swagger on **8.x**, and Sharp is explicitly pinned to **0.34.5 pending approval**. No database migration was performed.

The baseline npm audit reported **14 affected packages: 11 high and 3 moderate**. The broader dependency scanner reported **58 advisory/package/version findings: 38 high, 18 moderate and 2 low**. These are different counting methods, not interchangeable totals.

After the fixes, npm reports **2 high affected packages**, Sharp and its dependent Next package. The broader scanner reports **3 high advisory findings**, listed below. All other baseline findings have cleared.

## Every remaining finding

| Finding                                                                                                                                                          | Reachability and compensating controls                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Disposition                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sharp@0.34.5`, [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj): libvips CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | **Reachable image-processing surface.** Next's `getSharp()` unblocks GIF and TIFF loaders. The web app also permits public objects on `*.supabase.co`, including other projects: its optimiser cannot rely on Feastpot's upload validation alone. VIPS loading remains blocked; authenticated uploads, byte-signature validation, SVG rejection, browser HEIC conversion and file-size caps reduce the application's own upload surface but **do not fully mitigate the public optimiser**. | **Not risk-accepted. Awaiting approval** for the explicitly breaking Sharp 0.35 release.                                                                                                                                |
| `sharp@0.34.5`, [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c): libheif GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545                    | **Affected native decoding path not reachable through the current Next implementation.** Installed libheif is 1.20.2; Next 15.5.25 only enables `VipsForeignLoadHeif` for libheif >=1.23.2. No application API imports Sharp for HEIC decoding; HEIC is converted in the browser. This conclusion is specific to this Node/Next path, not a security assessment of the browser decoder's separately bundled WASM.                                                                           | **Documented, conditional acceptance** while the loader gate remains intact. Reassess if Sharp is used elsewhere, Next changes, or custom libvips is introduced. Patch with the same approved Sharp upgrade.            |
| `braces@3.0.3`, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested pattern stack exhaustion                                 | **No customer/upload-controlled pattern path found.** Installed callers are Tailwind's Chokidar watcher and lint-staged's Micromatch, operating on repository/build patterns. API code does not import Braces or pass uploaded filenames as glob patterns. The advisory has **no published patched version**.                                                                                                                                                                               | **Documented acceptance for the customer/upload threat model**, restricted to trusted build patterns. Developer-controlled builds can still be denied service. Reassess any user-supplied glob feature or upstream fix. |

Evidence: root and app manifests; `node_modules/next/dist/server/image-optimizer.js` (`getSharp`, `isAvifDecodeSafe`, content detection/optimisation); all three Next configurations; `npm ls braces --all`; source searches across `apps/` and `packages/`; live upload results. Reachability is based on code inspection and harmless fixtures, not exploitation of native vulnerabilities.

## Approval required: Sharp 0.35.5

Minimum patched version for both Sharp advisories: **0.35.4**. Proposed target: **0.35.5**, which was available during this assessment and is already within Next 15.5.25's declared optional dependency range.

[Sharp 0.35 release notes](https://github.com/lovell/sharp/releases/tag/v0.35.0) explicitly mark breaking changes: Node >=20.9; opt-in native source builds; changed AVIF quality tuning; a five-channel input default; removal of deprecated `failOnError`, metadata/sharpen properties; and a JP2 format rename. This repository requires Node >=22 and current Next supports both Sharp branches, so **no framework major upgrade or application API rewrite appears necessary**, but approval is still required.

Estimated work: **45-60 minutes** for the exact override/lockfile update, native loading checks, deprecated-API review, Next optimiser image regressions, workspace checks and a fresh seven-path matrix. Browser HEIC conversion stays unchanged. Nest 12, Next 16 and Swagger major upgrades are out of scope.

Alternative temporary control: explicitly disable native Next image optimisation across the three frontends. This reduces the exposed native-decoder surface but changes image serving and bandwidth usage; it has **not** been applied without a decision.

## Verification and limits

- Five workspace type checks passed: API, UI, Web, Vendor and Admin.
- Five scoped upload test suites passed: **35/35 tests**.
- Six shared-component browser cases passed at desktop/mobile widths, including aspect ratio, missing-image placeholders and a harmless private-download header fixture. This is not a signed-in portal UI test.
- The final seven-path live matrix passed **63/63 cases**, including upright JPEG pixels and desktop/mobile aspect ratios. Its access checks are recorded in `upload-matrix-after-dependency-upgrades.json`; individual advisory decisions are in `dependency-advisory-assessment.md`.
- Test identities and objects are development-only. No queue was cleared, paused or resumed, and anonymous application draft setup did not enqueue a resume email.
- Direct authenticated Supabase Storage access by the other vendor returned **HTTP 500**, not a normal permission denial. This failed closed but **does not prove Storage RLS is correct**. The application download route separately returned 401 signed out, 403 cross-vendor and 200 to the owner.
- Production dependency deployment, production Storage policies, historical public-document exposure and signed-in portal screens were not verified.
