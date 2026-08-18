# Runbook - Custom Supabase auth domain (auth.feastpot.co.uk)

Goal: the Google OAuth consent screen shows **feastpot.co.uk** instead of the
Supabase project subdomain.

## Agent work already done

Every reference to `NEXT_PUBLIC_SUPABASE_URL` in all four apps reads from the
environment variable - none of the application source files hard-code the
project subdomain. Verification:

```
# Run from repo root - should return zero source-file hits:
grep -rn --include="*.ts" --include="*.tsx" --include="*.mjs" \
  "supabase\.co" \
  apps/admin/src apps/web/src apps/vendor/src apps/api/src \
  | grep -v "node_modules" \
  | grep -v "\.spec\." \
  | grep -v "supabase-env\.ts" \
  | grep -v "# " \
  | grep -v "//"
```

The only legitimate project-ID reference remaining is `DEV_SUPABASE_REF` in
`apps/api/src/common/config/supabase-env.ts`. That constant is intentional: it
identifies the dev project so the startup guard can distinguish dev from prod
and log accordingly. It must stay.

`*.supabase.co` wildcard entries in `next.config.ts` / `next.config.mjs` are
Next.js image-hostname fallbacks for when the env var is not set at build time.
They do not hard-code a specific project; they are acceptable.

Once the custom domain is set, update `NEXT_PUBLIC_SUPABASE_URL` in dev and
prod (see step 3 below) and the wildcards become dead code that does no harm.

---

## FOUNDER CHECKLIST

Execute these steps in order. Do not skip straight to prod - test in dev first.

1. **Supabase dashboard, Project Settings, Custom Domains**: enable the add-on
   (10 USD per month) and set `auth.feastpot.co.uk`.

2. **Add the CNAME record** Supabase provides at the DNS registrar; wait for
   verification. Supabase will poll until the record propagates (usually
   minutes, up to 24 h for slow registrars).

3. **Update `NEXT_PUBLIC_SUPABASE_URL`** in dev first: set the secret to
   `https://auth.feastpot.co.uk` via the Replit secrets panel (or
   `SUPABASE_URL` for the API, which reads that var). Test full sign-in
   including Google OAuth. Confirm:
   - Password sign-in works.
   - Magic-link email arrives and the `/auth/confirm` redirect resolves.
   - Google OAuth flow completes and the Google account chooser shows
     **feastpot.co.uk**.
   - Supabase Storage image URLs still load (the Storage API is also served
     from the custom domain).
   - Realtime subscriptions connect (WebSocket path changes with the domain).
     Once dev is clean, repeat for prod.

4. **Google Cloud Console**: open the OAuth client used for Supabase, add
   `https://auth.feastpot.co.uk/auth/v1/callback` as an authorised redirect
   URI. **Keep the old `https://<ref>.supabase.co/auth/v1/callback` URI
   until cutover is fully verified**, then remove it. Both URIs are valid
   during the transition window.

5. **Confirm** the Google account chooser now shows **feastpot.co.uk** in the
   consent header. Remove the old OAuth redirect URI. Done.

---

## Propagation and rollback notes

- The URL change affects **auth, storage, and realtime** - the dev test must
  cover more than just sign-in (see step 3 above).
- Supabase serves both the old subdomain and the custom domain for a short
  grace window after cutover. Keep the old Google redirect URI active until
  end-to-end sign-in is confirmed on the new domain.
- To roll back: revert `NEXT_PUBLIC_SUPABASE_URL` (and `SUPABASE_URL`) to the
  original subdomain and restore the old Google redirect URI. The Supabase
  custom domain add-on can be disabled from the dashboard.
