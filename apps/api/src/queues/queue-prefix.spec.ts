import { resolveQueuePrefix } from './queue-prefix';

describe('operational queue isolation', () => {
  it('preserves the existing production namespace', () => {
    expect(resolveQueuePrefix({ NODE_ENV: 'production' })).toBe('bull');
  });

  it('keeps factory tests out of production even when Redis is shared', () => {
    expect(
      resolveQueuePrefix({ NODE_ENV: 'test', TEST_FACTORY_NAMESPACE: 'admin-actions-123' }),
    ).toBe('bull:test:admin-actions-123');
  });

  it('isolates tests without a configured factory namespace', () => {
    expect(resolveQueuePrefix({ NODE_ENV: 'test' })).toBe(`bull:test:${process.pid}`);
  });

  it('rejects unsafe namespace values rather than choosing operational queues', () => {
    expect(() =>
      resolveQueuePrefix({ NODE_ENV: 'test', TEST_FACTORY_NAMESPACE: 'bull:notifications' }),
    ).toThrow('TEST_FACTORY_NAMESPACE');
  });
});
