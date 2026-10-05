/**
 * Authoritative test suites may share Redis infrastructure, but must never
 * pause or consume operational queues. Keep the production namespace intact.
 */
export function resolveQueuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV !== 'test') return 'bull';
  const namespace = env.TEST_FACTORY_NAMESPACE || String(process.pid);
  if (!/^[a-zA-Z0-9_.-]+$/.test(namespace)) {
    throw new Error('TEST_FACTORY_NAMESPACE must contain only letters, digits, dots, _ and -');
  }
  return `bull:test:${namespace}`;
}
