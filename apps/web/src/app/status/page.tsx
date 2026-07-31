import type { Metadata } from 'next';

import { StatusClient } from './status-client';

export const metadata: Metadata = {
  title: 'System status — Feastpot',
  description: 'Live operational status of the Feastpot website, ordering API and portals.',
  robots: { index: false, follow: false },
};

export default function StatusPage() {
  return <StatusClient />;
}
