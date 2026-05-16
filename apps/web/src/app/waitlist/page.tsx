import type { Metadata } from 'next';
import { Suspense } from 'react';

import { WaitlistForm } from '@/components/waitlist/waitlist-form';

export const metadata: Metadata = {
  title: 'We&apos;re not in your area yet — join the waitlist',
  description:
    'Feastpot is expanding across the UK. Leave your email and we&rsquo;ll let you know the moment a kitchen goes live in your postcode.',
  alternates: { canonical: '/waitlist' },
};

export default function WaitlistPage() {
  return (
    <Suspense fallback={null}>
      <WaitlistForm />
    </Suspense>
  );
}
