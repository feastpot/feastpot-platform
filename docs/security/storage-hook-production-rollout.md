# Coordinated production Storage hook rollout

Prepared 3 October 2026. Production API URL verified through deployment metadata: **https://api.feastpot.co.uk**. This document and the commands below prepare the release; no production changes have been applied.

## Why this is two-phase

GitHub's production database job and Replit's VM startup both run Prisma migrations **before** the new API is live. Changing the registered token hook in that migration would issue new-format tokens while the old API was still running.

The migration therefore **only stages** `public.custom_access_token_hook_v2`, its auth-admin permissions and required role-read policy. It does not modify the registered `public.custom_access_token_hook`. The staged function is not a public RPC. Supabase Dashboard registration remains unchanged.

The separate activation command refuses to write unless:

- The live HTTPS API reports the compiled `app_role-v1` reader capability.
- Its Supabase environment is production and project matches `PROD_DIRECT_URL`.
- The API's database check is healthy.
- The staged function and Supabase auth-admin role exist.
- The document bucket remains private and Storage object RLS is enabled.

The command is read-only by default. It uses the existing secret without printing it or placing it in command arguments.

## Preparation verification

- All 12 rollout-gate tests and API type checking passed.
- A development transaction verified that migration staging leaves the registered hook unchanged, grants only Auth the staged implementation, and that activation preserves the application-role roundtrip. The transaction was rolled back.
- The production read-only gate reported exactly `COMPATIBLE_API_NOT_LIVE` and `STAGED_HOOK_MIGRATION_NOT_APPLIED`. The database/project match and minimum private Storage checks passed. No activation was attempted.

## Release sequence

1. **Release the prepared changes through the normal reviewed branch/CI flow.** The production migration may stage the new function at this point; existing sessions and the registered live hook stay unchanged. Do not apply an older copy of this migration that directly replaces the registered hook.
2. **Publish the compatible API on the existing Replit VM.** Its build/start configuration remains unchanged. Startup migration staging is safe before the listener opens. The API supports signed `app_role`, legacy signed role tokens and server-managed role metadata, preserving the existing MFA gate.
3. **Run the read-only production gate:**

   ```bash
   npm run rollout:storage-hook -- --api-url https://api.feastpot.co.uk
   ```

   Proceed only when it reports `ready: true`. Exit code 2 means it is waiting for prerequisites; no changes were made. Do not bypass a missing capability by guessing the deployed version from a successful build.

4. **After explicit approval to change production**, activate:

   ```bash
   npm run rollout:storage-hook -- --api-url https://api.feastpot.co.uk --apply
   ```

   The API is checked again immediately before activation. Replacing the registered function and validating the token contract occur in one database transaction, preserving its name and existing grants. The command checks the resulting contract again afterward. An already-correct hook is a no-op.

5. **Refresh/reissue test sessions naturally**, or sign out/in on an existing authorised account. Old JWTs retain their old signed claims until refresh; the API remains compatible, but direct Storage reads with those old JWTs can still return 500. Do not revoke all production sessions.
6. **Verify using existing authorised production accounts and a harmless authorised document**, without creating fake public vendors or clearing queues:
   - Fresh token database `role` is `authenticated`; signed `app_role` matches the account.
   - Direct private Storage reads are denied normally, not with 500.
   - Owner API download is 200 with expected bytes.
   - Signed-out and another vendor's API requests are 401/403.
   - A permitted staff download uses a genuine AAL2 session.
   - Public images remain 200.

The three frontends do not need an auth-reader code change for this repair. Rebuild all three through their normal Vercel release flow to ship the separately approved Sharp dependency patch; publishing the API alone does not patch their native image optimisers.

## Recovery

If transactional activation fails, PostgreSQL rolls it back and the existing registered hook remains intact. Do not roll the API back to a reader that ignores `app_role` while the new hook is active.

For an unexpected later authentication regression, keep the compatible API deployed, inspect the live hook and auth-admin permissions, and coordinate any restoration from the database's prior function definition with explicit approval. Restoring the legacy claim layout also restores the original Storage defect; it is not a permanent fix.

Development evidence is in `private-storage-repair.md` and its sanitised before/after JSON files. Signed-in production screens and production document access have not yet been verified.
