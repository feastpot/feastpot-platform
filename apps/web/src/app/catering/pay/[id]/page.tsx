'use client';

import { CateringPaymentClient } from '@/components/checkout/catering-payment-client';
import { useParams } from 'next/navigation';

export default function CateringDepositPaymentPage() {
  const params = useParams<{ id: string }>();
  return <CateringPaymentClient bookingId={params?.id ?? ''} purpose="deposit" />;
}
