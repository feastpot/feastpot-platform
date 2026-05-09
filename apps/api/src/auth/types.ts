import type { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthedRequest {
  user: AuthUser | null;
  headers: Record<string, string | string[] | undefined>;
}
