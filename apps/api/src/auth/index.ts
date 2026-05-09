export { AuthModule } from './auth.module';
export { SupabaseService } from './supabase.service';
export { SupabaseAuthGuard } from './guards/supabase-auth.guard';
export { OptionalAuthGuard } from './guards/optional-auth.guard';
export { RolesGuard } from './guards/roles.guard';
export { Public } from './decorators/public.decorator';
export { Roles } from './decorators/roles.decorator';
export { CurrentUser } from './decorators/current-user.decorator';
export type { AuthUser } from './types';
