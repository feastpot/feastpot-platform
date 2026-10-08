'use client';

import { CateringPaymentClient } from '@/components/checkout/catering-payment-client';
import { useParams } from 'next/navigation';

export default function CateringBalancePaymentPage() {
  const params = useParams<{ id: string }>();
  return <CateringPaymentClient bookingId={params?.id ?? ''} purpose="balance" />;
}
