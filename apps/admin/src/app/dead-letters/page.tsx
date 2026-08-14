import { requireStaff } from '@/lib/auth/server-gate';

import { DeadLettersClient } from './dead-letters-client';

export default async function DeadLettersPage() {
  await requireStaff('/dead-letters', ['admin']);
  return <DeadLettersClient />;
}
