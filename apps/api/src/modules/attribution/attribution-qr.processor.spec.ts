import { AttributionQrProcessor } from './attribution-qr.processor';

describe('AttributionQrProcessor', () => {
  it('discovers a bounded batch and enqueues each link through the idempotent service API', async () => {
    const attribution = {
      findMissingQrLinks: jest.fn().mockResolvedValue([
        { id: 'link-a', slug: 'a' },
        { id: 'link-b', slug: 'b' },
      ]),
      enqueueQrGeneration: jest.fn().mockResolvedValue(undefined),
      enqueueQrBackfill: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new AttributionQrProcessor(attribution as never);

    await expect(processor.backfill()).resolves.toEqual({ queued: 2 });
    expect(attribution.findMissingQrLinks).toHaveBeenCalledWith(100);
    expect(attribution.enqueueQrGeneration).toHaveBeenCalledWith('link-a');
    expect(attribution.enqueueQrGeneration).toHaveBeenCalledWith('link-b');
  });

  it('requests automatic background recovery at application bootstrap', () => {
    const attribution = {
      findMissingQrLinks: jest.fn(),
      enqueueQrGeneration: jest.fn(),
      enqueueQrBackfill: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new AttributionQrProcessor(attribution as never);

    processor.onApplicationBootstrap();

    expect(attribution.enqueueQrBackfill).toHaveBeenCalledTimes(1);
  });
});
