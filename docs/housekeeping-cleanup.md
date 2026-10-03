# Housekeeping verification

## H1: Environment contract

All 16 names from the static audit are documented in the root `.env.example`.
Each entry names its owning runtime, required/optional status, purpose and
absence behavior. Entries are commented, empty placeholders: no configured
values were copied, and optional missing values are not replaced by empty
strings when the template is copied.

The contract distinguishes runtime configuration from API-owned seed,
migration and test-factory tooling. It also identifies the currently inactive
vendor Sentry scaffold rather than claiming that a DSN alone enables telemetry.

## H2: Supported lint command with unchanged scope

The earlier cleanup already replaced `next lint` with the supported ESLint CLI.
This change restores all eight extensions from the installed Next CLI defaults:
`js`, `mjs`, `cjs`, `jsx`, `ts`, `mts`, `cts`, `tsx`.

Each frontend has only `src` among Next's default lint directories, so `eslint
src` preserves the previous directory set. The existing ESLint configuration
and ignore rules remain unchanged.

Verified source file counts:

| Workspace | Files | Diagnostics |
| --------- | ----: | ----------: |
| web       |   190 |           0 |
| vendor    |   174 |           0 |
| admin     |   163 |           0 |

The final admin production build also passes lint and type verification after
the sign-in change, with zero build warnings.

## H3: Required CI typography check

The existing required `Lint` job now invokes `scripts/no-em-dash.mjs` and its
committed-fixture regression tests. It is a blocking step, with no
`continue-on-error` or conditional bypass.

The check inventories Git-managed source (including non-ignored new files for
local use), covers every workspace and all requested file types, including both
YAML extensions, SQL, shell and text. It additionally covers module variants
of JavaScript and TypeScript. Scan errors fail rather than being treated as a
clean result.

The expanded coverage found old punctuation in workflow comments, shell
messages, script comments and an operator email subject; these were corrected.
Existing root-level operator reports, audit reports, agent content and uploaded
inputs remain outside the source-style rule. Workspace documentation is not
excluded.

Two historical applied migrations contain old punctuation. Their bytes are
unchanged because Prisma records migration checksums. Only their exact original
SHA-256 snapshots are grandfathered; modifying either snapshot removes its
exception, and new SQL migrations are fully checked.

Verification:

- Full source check passes across 1,371 files.
- All 21 regression checks pass.
- Each of the 17 covered extensions has a deliberately committed violation in
  an isolated temporary Git repository, with hooks explicitly bypassed.
- The exact CI command exits 1 and identifies the offending file in each case.
- All workspace roots, documentation boundaries, migration exceptions and
  fail-closed scan behavior have dedicated checks.
- Main branch protection was read and confirms that `Lint` is required.

**Hosted negative-proof blocker:** an isolated verification branch was attempted
through the connected GitHub integration. GitHub writes returned Cloudflare
HTTP 403 rather than API JSON. No verification branch was created, no PR was
opened and nothing was merged or published. A hosted failed-run URL is therefore
not available; that acceptance item remains pending. Local committed-fixture
verification is not represented as a hosted CI run.

## H4: Missing vendor HTTP status

The prior fix already resolves definite upstream 404s before the App Router
can stream a successful loading shell. No second routing implementation was
added. Both GET and HEAD on `/vendors/audit-missing-slug` were verified to
return HTTP 404.

## H5: Admin sign-in resources and form warnings

The missing resource was the implicit favicon. Metadata now selects the
existing logo-mark PNG; its request returns HTTP 200.

The current page already had one non-nested POST form. Chrome nevertheless
reported a complex-form warning because it contained a hidden decoy password
alongside the real password. The decoy fields were removed. Read-only-on-focus,
autocomplete controls, POST semantics and the existing authentication/MFA
behavior were retained.

Verified against the actual production build:

- Sign-in HTTP 200, hydrated React form.
- Exactly one form and one password field, no nested forms.
- Form method POST; focus genuinely unlocks the initially read-only email.
- Favicon HTTP 200, no failed resource responses.
- No console error, warning or DOM form-classification message.
- No WebSocket connection: the HMR endpoint belongs to development only.

Screenshot: `audit/evidence/housekeeping-admin-sign-in.jpg`.
All changed YAML and shell snippets passed 140 syntax checks.

The temporary production verification server was stopped afterwards; the
normal development workflows were restored.
