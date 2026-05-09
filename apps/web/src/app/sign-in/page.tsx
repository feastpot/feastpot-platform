import { PageShell } from '@/components/layout/page-shell';

/**
 * Sign-in placeholder. Real OTP/magic-link flow will wire to Supabase Auth in
 * a follow-up — this page only exists today so the middleware redirect target
 * resolves.
 */
export default function SignInPage() {
  return (
    <PageShell>
      <section className="space-y-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground">
          Authentication coming soon. Continue browsing as a guest in the meantime.
        </p>
      </section>
    </PageShell>
  );
}
