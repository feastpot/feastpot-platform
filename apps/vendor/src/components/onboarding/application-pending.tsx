import Link from 'next/link';

import { WEB_URL } from '@/lib/env';

export function ApplicationPending() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      <section className="mx-auto max-w-2xl space-y-4 py-8">
        <h1 className="text-2xl font-semibold">Your vendor profile is not set up yet</h1>
        <p className="text-sm text-muted-foreground">
          If you have applied, our team will review your application and email you when your kitchen
          is approved for setup. You do not need to accept Vendor Terms until your vendor profile is
          ready.
        </p>
        <Link href={`${WEB_URL}/become-a-vendor`} className="text-sm font-medium underline">
          Apply or resume your application
        </Link>
      </section>
    </main>
  );
}
