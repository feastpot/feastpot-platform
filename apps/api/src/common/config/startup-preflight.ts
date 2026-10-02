// Keep this module dependency-free: invalid production configuration must fail
// before loading monitoring SDKs, application modules or background workers.
import { assertProductionAdminMfaEnforced, assertRequiredEnvOrExit } from './required-env';
import { resolveStripeEnv } from './resolve-stripe-env';

resolveStripeEnv();
assertRequiredEnvOrExit();
assertProductionAdminMfaEnforced();
