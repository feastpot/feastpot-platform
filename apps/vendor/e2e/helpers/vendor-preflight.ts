import type { TestDataFactory } from '../../../../scripts/test-factory';

export function preflightNamespaces(root: string) {
  if (!/^vendor-preflight-[a-z0-9-]{1,60}$/.test(root)) {
    throw new Error('VENDOR_PREFLIGHT_NAMESPACE_REQUIRED: dedicated vendor-preflight-* root');
  }
  return { actor: `${root}-actor`, target: `${root}-target` };
}

type Owner = {
  namespace: string;
  state: 'V4' | 'V9';
  factory: Pick<TestDataFactory, 'teardownState' | 'assertStateClean' | 'dispose'>;
};

/** Validate all scope keys before the first destructive adapter call. */
export async function cleanupPreflight(root: string, owners: Owner[]): Promise<void> {
  const expected = preflightNamespaces(root);
  if (
    owners.length !== 2 ||
    owners[0].namespace !== expected.actor ||
    owners[0].state !== 'V4' ||
    owners[1].namespace !== expected.target ||
    owners[1].state !== 'V9'
  ) {
    throw new Error('VENDOR_PREFLIGHT_CLEANUP_NAMESPACE_MISMATCH: refusing cleanup');
  }
  const errors: Error[] = [];
  for (const owner of owners) {
    try {
      await owner.factory.teardownState(owner.state);
      await owner.factory.assertStateClean(owner.state);
    } catch (error) {
      const code =
        error instanceof Error
          ? (error.message.match(/^TEST_FACTORY_[A-Z_]+/)?.[0] ?? 'ADAPTER_ERROR')
          : 'ADAPTER_ERROR';
      errors.push(new Error(`VENDOR_PREFLIGHT_CLEANUP_FAILED: ${owner.state}; ${code}`));
    } finally {
      await owner.factory.dispose();
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, errors.map((error) => error.message).join('; '));
  }
}

/** The same cookie reader is injected into the real browser chain and fault tests. */
export async function requireBrowserSession(read: () => Promise<string>): Promise<string> {
  try {
    const token = await read();
    if (!token) throw new Error('empty');
    return token;
  } catch {
    throw new Error('VENDOR_PREFLIGHT_COOKIE_SESSION_FAILED: no browser SSR cookie session');
  }
}
