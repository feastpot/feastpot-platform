import { redirect } from 'next/navigation';

import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/server-gate';

import { TwoFaEnrolClient } from './two-fa-enrol-client';

export const dynamic = 'force-dynamic';

/**
 * Dedicated TOTP enrolment page.
 *
 * This route is in the middleware allowlist so an aal1 staff session can reach
 * it without being redirected again. requireStaff is called with
 * skipAalCheck: true for the same reason.
 *
 * All staff roles can reach this page (not just admin), because every staff
 * member needs to enrol before they can access any other admin route when
 * ADMIN_REQUIRE_AAL2 is on.
 */
export default async function TwoFaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const next = params.next ?? '/';

  // Validate session without asserting aal2 (that would redirect to this very page).
  const user = await requireStaff('/settings/2fa', undefined, { skipAalCheck: true });

  // If the user is already aal2 (e.g. they navigated here manually), send them
  // where they were going so they don't have to re-enrol unnecessarily.
  if (user.aal === 'aal2') {
    redirect(next);
  }

  return <TwoFaEnrolClient next={next} user={user} />;
}
