# Private Storage 500 repair

Verified in development on 3 October 2026. No production database, Storage policy or bucket visibility was changed.

## Cause and fix

The custom access-token hook overwrote Supabase's reserved JWT `role` with a Feastpot application role. Supabase Storage interprets that claim as a PostgreSQL database role; roles such as `vendor` do not exist. Real authenticated owner and cross-vendor requests both reproduced HTTP 500 `DatabaseError` before the repair.

The hook now sets database `role: authenticated` and places the role from `public.users.role` in signed `app_role`. The API reads `app_role` first, retains support for legacy signed application-role tokens during rollover, and continues to reject user-editable role metadata. The repair is versioned in a SQL migration; the existing Dashboard hook registration stays intact.

No application PostgreSQL roles, permissive Storage policies, public private-document buckets or authentication bypasses were introduced.

## Focused live evidence

`scripts/verify-private-storage-access.ts` uses development-only factory users and a harmless PNG. It verifies that the protected object actually exists and that successful reads return identical bytes, then removes its fixture objects and identities. It does not start queue workers or change shared queue state.

| Check                               | Before                   | After                              |
| ----------------------------------- | ------------------------ | ---------------------------------- |
| Direct private Storage owner        | HTTP 500 / DatabaseError | HTTP 400 / Storage 404 `not_found` |
| Direct private Storage other vendor | HTTP 500 / DatabaseError | HTTP 400 / Storage 404 `not_found` |
| Private API signed out              | 401                      | 401                                |
| Private API other vendor            | 403                      | 403                                |
| Private API owner                   | 200, exact bytes         | 200, exact bytes                   |
| Private API customer                | Not checked              | 403                                |
| Private API AAL2 admin              | Not checked              | 200, exact bytes                   |
| Public image signed out             | 200, exact bytes         | 200, exact bytes                   |

The Supabase masked-not-found response is expected: direct private Storage reads are deliberately not authorised, even for owners. Allowed owner/staff reads go through the API proxy. The service-side Storage read independently confirmed the object existed and matched the uploaded bytes.

All six Feastpot roles were checked using real Supabase sessions: customer, vendor (two distinct users), admin, support, finance and compliance. Signed claims and API role mapping remained correct. The admin download used a genuine AAL2 session, not an MFA bypass.

API type checking and all 33 targeted authentication, MFA and Storage unit tests passed. Database checks confirmed the document bucket remains private, the image bucket remains public and Storage object RLS remains enabled. The API workflow is running and the public homepage renders.

Sanitised before/after evidence: `private-storage-before.json` and `private-storage-after.json`. The broader upload matrix now fails explicitly on a Storage 500 rather than treating any closed response as an access-denial success. Its historical dependency-upgrade output is retained, not rewritten as if it had run after this repair.

## Rollout limits

Only the development hook has been updated. The prepared migration now stages an inactive implementation, safe to run before the API publish. Activation is a separate live-API-gated command requiring explicit production approval; see `storage-hook-production-rollout.md`. Dashboard registration remains external configuration. Existing signed tokens keep their old claims until refreshed/reissued; API authorisation remains compatible, but those old tokens can still cause the Storage 500 until refresh. No mass session revocation was performed.

Production, historical object exposure and signed-in portal UI were not verified by this work.
