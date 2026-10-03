import type { Instrumentation } from 'next';

import { reportErrorIncident } from '@/lib/api/error-incidents';

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  const cause =
    error instanceof Error ? (error as Error & { digest?: string }) : new Error(String(error));
  await reportErrorIncident({
    app: 'admin',
    route: request.path.split('?')[0] ?? '/',
    message: cause.message || 'Server rendering failed',
    detail: cause.stack,
    digest: (cause as Error & { digest?: string }).digest,
  });
};
