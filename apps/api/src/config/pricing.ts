/**
 * Platform pricing policy constants.
 *
 * These are intentional product principles, not configuration options.
 * Changing them requires a policy decision, not a config tweak.
 */

/**
 * Verification signals are never gated by any paid tier, placement product
 * or subscription. This is a product principle, not a configuration option.
 * Monetising the safety layer would destroy the platform's core
 * differentiation.
 */
export const VERIFICATION_IS_NEVER_MONETISED = true as const;
