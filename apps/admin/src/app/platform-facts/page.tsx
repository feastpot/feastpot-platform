import { PlatformFacts } from '@/components/platform-facts';

export const dynamic = 'force-dynamic';

export default function PlatformFactsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-bold">Platform facts</h1>
      <p className="mt-3 text-slate-600">Current commercial, policy and support information.</p>
      <PlatformFacts />
    </main>
  );
}
