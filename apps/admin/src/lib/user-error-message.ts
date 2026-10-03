import { createUserErrorMapper } from '@feastpot/ui/user-error';

import { reportErrorIncident } from '@/lib/api/error-incidents';

export const userErrorMessage = createUserErrorMapper((payload) =>
  reportErrorIncident({ ...payload, app: 'admin' }),
);
