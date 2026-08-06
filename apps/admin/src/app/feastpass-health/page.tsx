import { requireStaff } from '@/lib/auth/server-gate';

import { FeastPassHealthClient } from './feastpass-health-client';

export const metadata = { title: 'FeastPass health | Feastpot Admin' };

export default async function FeastPassHealthPage() {
  const { session } = await requireStaff();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">FeastPass health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monthly renewal rate is the north-star metric. Alert fires if it drops below 80%.
        </p>
      </div>
      <FeastPassHealthClient accessToken={session.access_token} apiUrl={apiUrl} />
    </div>
  );
}
