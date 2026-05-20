import type { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  /**
   * Authenticator Assurance Level from the verified Supabase JWT.
   *   - 'aal1': password (or other single-factor) sign-in
   *   - 'aal2': password + verified MFA challenge in this session
   * Endpoints that mutate MFA state (e.g. minting recovery codes) MUST
   * require `aal === 'aal2'`. Absent / undefined is treated as aal1 by
   * convention so a missing claim defaults to the safer interpretation;
   * the SupabaseAuthGuard always populates this field from the verified
   * JWT, so production traffic will always carry a concrete value.
   */
  aal?: 'aal1' | 'aal2';
}

export interface AuthedRequest {
  user: AuthUser | null;
  headers: Record<string, string | string[] | undefined>;
}
