# Dependency risk note

Updated: 3 October 2026, after the user approved Sharp 0.35.5. Scope: workspace dependencies and the seven LR-06 upload paths. This is not a production security clearance.

## Outcome

**Sharp 0.35.5 is installed and exactly pinned**, using native **libvips 8.18.7** and **libheif 1.23.5**. Both Sharp advisories and the inherited Next finding have cleared. Next remains **15.5.25**, Nest remains **11.x**, and Swagger remains **8.x**. Browser HEIC conversion is unchanged; no API-side native HEIC processing or database migration was added.

| Scan                       | Original baseline                                                 | After all approved fixes     |
| -------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| npm audit                  | 14 affected packages: 11 high, 3 moderate                         | **Zero vulnerabilities**     |
| Broader dependency scanner | 58 advisory/package/version findings: 38 high, 18 moderate, 2 low | **One high finding: Braces** |

These scans use different counting methods and advisory coverage. The clean npm result does **not** mean the broader scanner's remaining finding has disappeared.

## Remaining finding and compensating controls

**`braces@3.0.3`: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)**, stack exhaustion from deeply nested brace patterns. There is no published patched version.

**Reachability:** no customer/upload-controlled pattern path was found. Installed callers are Tailwind's Chokidar watcher and lint-staged's Micromatch, processing repository/build patterns. The application does not import Braces or pass uploaded filenames as glob expressions.

**Disposition:** documented acceptance for the **customer/upload threat model only**, conditional on trusted build inputs. Developer-controlled patterns can still deny service to a build or lint process. Do not expose this parser to user-supplied glob strings; review this acceptance when callers change or an upstream fix is published.

Evidence: `npm ls braces --all`, application source searches and the complete baseline assessment in `dependency-advisory-assessment.md`.

## Closed Sharp findings

- [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), libvips CVE-2026-33327, CVE-2026-33328, CVE-2026-35590 and CVE-2026-35591: **fixed by the installed libvips 8.18.7**. Next's GIF/TIFF optimiser surface had been reachable, including through the web app's wildcard Supabase public-object host rule; Feastpot's upload allowlist alone was not a sufficient mitigation.
- [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), libheif GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545: **fixed by the installed libheif 1.23.5**. Next's native AVIF decoder now passes its safe-version gate and was exercised in regression tests. Browser HEIC conversion remains a separate WASM implementation; these Node dependency results are not a security assessment of that WASM.

The user approved Sharp's [explicitly breaking 0.35 release](https://github.com/lovell/sharp/releases/tag/v0.35.0). Its Node minimum is satisfied by this repository's Node >=22 requirement. No use of the removed deprecated Sharp APIs was found in application code, and Next 15.5.25 already supports the 0.35 branch. No framework major upgrade, optimiser shutdown or auth bypass was needed.

## Verification and limits

- Five workspace type checks passed: API, UI, Web, Vendor and Admin.
- Five scoped upload suites passed: **35/35 tests**.
- **18/18 native Next optimiser checks** passed: JPEG, PNG, WebP, GIF, TIFF, AVIF, rotated JPEG and CMYK JPEG inputs to both WebP and AVIF output, plus invalid-image and SVG rejection. Optimisation fallback was not counted as success.
- Live Next HTTP optimisation returned correctly decoded **640-pixel WebP and AVIF** images.
- Six shared-component desktop/mobile rendering checks passed, including placeholders, aspect ratios and a harmless private-download header fixture. Signed-in portal screens were not verified.
- The fresh post-Sharp seven-path matrix passed **63/63 cases**, including upright JPEG pixels and desktop/mobile aspect ratios. Its access checks are recorded in `upload-matrix-after-dependency-upgrades.json`. Native results are in `sharp-upgrade-results.json`.
- Four development workflows restarted and are running. The public homepage renders. Lockfile tarball URLs were normalised for external CI without changing versions or integrity hashes.
- Fixture data is development-only. No shared queue was cleared, paused or resumed; draft setup did not enqueue a resume email.
- Direct authenticated Supabase Storage access returned **HTTP 500** for the other vendor in the fresh matrix. This failed closed but is **not proof that Storage RLS works correctly**. The application download route separately returned 401 signed out, 403 cross-vendor and 200 for the owner; the Storage issue has its own proposed follow-up.
- Production deployment, production Storage policies and historical public-document exposure were not verified. These fixes are in the workspace, not published.
