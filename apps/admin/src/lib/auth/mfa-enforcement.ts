/**
 * The admin app requires both of its runtime/build-time flag surfaces to agree.
 * Keeping this fail-closed means a missing Vercel variable cannot accidentally
 * turn the middleware or server-component gate into an advisory check.
 */
export function isAdminMfaEnforced(): boolean {
  return (
    process.env.ADMIN_REQUIRE_AAL2 === 'true' &&
    process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2 === 'true'
  );
}
