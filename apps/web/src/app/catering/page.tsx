import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CateringFunnel } from './catering-funnel';

export const metadata: Metadata = {
  title: 'Event Catering | Feastpot',
  description:
    'Planning food for 20 or more people? Tell us about your event and we will match you with verified African and Caribbean caterers. Weddings, birthdays, office catering and more.',
  alternates: {
    canonical: 'https://feastpot.co.uk/catering',
  },
  openGraph: {
    title: 'Event Catering | Feastpot',
    description:
      'Match with verified African and Caribbean caterers for your event. Weddings, birthdays, office catering and more.',
    type: 'website',
    url: 'https://feastpot.co.uk/catering',
  },
};

const SKELETON = (
  <div className="mx-auto max-w-lg animate-pulse px-4 py-12 sm:px-6">
    <div className="mb-6 h-8 rounded-xl bg-cream" />
    <div className="mb-4 h-2 rounded-full bg-cream" />
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 rounded-2xl bg-cream" />
      ))}
    </div>
  </div>
);

export default function CateringPage() {
  return (
    <Suspense fallback={SKELETON}>
      <CateringFunnel />
    </Suspense>
  );
}
