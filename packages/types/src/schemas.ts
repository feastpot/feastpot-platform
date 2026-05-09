import { z } from 'zod';

export const HealthCheckSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
