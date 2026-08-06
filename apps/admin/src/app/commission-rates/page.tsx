import { redirect } from 'next/navigation';

import { requireStaff } from '@/lib/auth/require-staff';

import { CommissionRatesClient } from './commission-rates-client';

export const metadata = { title: 'Commission rates | Feastpot Admin' };

export default async function CommissionRatesPage() {
  const user = await requireStaff();
  if (!user) redirect('/login');

  return <CommissionRatesClient />;
}
