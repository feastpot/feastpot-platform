import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { SupabaseService } from '../../auth/supabase.service';

import { DOCUMENTS_BUCKET, SupabaseStorageService } from './supabase-storage.service';

describe('SupabaseStorageService startup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeService(createBucket: jest.Mock, updateBucket = jest.fn()) {
    const storage = { createBucket, updateBucket, from: jest.fn() };
    const supabase = { getClient: () => ({ storage }) } as unknown as SupabaseService;
    return { service: new SupabaseStorageService(supabase), storage };
  }

  it('opens a Nest HTTP listener even when bucket provisioning never settles', async () => {
    const { service, storage } = makeService(jest.fn(() => new Promise(() => undefined)));
    const module = await Test.createTestingModule({
      providers: [{ provide: SupabaseStorageService, useValue: service }],
    }).compile();
    const app = module.createNestApplication();
    try {
      await app.listen(0, '127.0.0.1');
      expect(app.getHttpServer().listening).toBe(true);
      expect(storage.createBucket).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });

  it('preserves public media and private document bucket settings', async () => {
    const { service, storage } = makeService(jest.fn().mockResolvedValue({ error: null }));
    expect(service.onModuleInit()).toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(storage.createBucket).toHaveBeenCalledWith(
      'feastpot-media',
      expect.objectContaining({ public: true }),
    );
    expect(storage.createBucket).toHaveBeenCalledWith(
      DOCUMENTS_BUCKET,
      expect.objectContaining({ public: false }),
    );
  });

  it('updates existing buckets without blocking startup', async () => {
    const { service, storage } = makeService(
      jest.fn().mockResolvedValue({ error: { message: 'Bucket already exists' } }),
      jest.fn().mockResolvedValue({ error: null }),
    );
    expect(service.onModuleInit()).toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(storage.updateBucket).toHaveBeenCalledTimes(2);
    expect(storage.updateBucket).toHaveBeenCalledWith(
      DOCUMENTS_BUCKET,
      expect.objectContaining({ public: false }),
    );
  });

  it('handles rejected provisioning requests without an unhandled rejection', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service } = makeService(jest.fn().mockRejectedValue(new Error('Storage offline')));
    expect(service.onModuleInit()).toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(warning).toHaveBeenCalledWith(
      'Storage bucket provisioning failed; uploads may be unavailable.',
    );
  });

  it('still reports an upload failure explicitly', async () => {
    const { service, storage } = makeService(jest.fn());
    storage.from.mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: { message: 'Storage offline' } }),
    });
    await expect(
      service.uploadMenuImportSource({
        vendorId: 'vendor',
        importId: 'import',
        file: {
          originalname: 'menu.pdf',
          mimetype: 'application/pdf',
          size: 12,
          buffer: Buffer.from('%PDF-1.7 demo'),
        },
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('SupabaseStorageService menu imports', () => {
  const service = new SupabaseStorageService({} as SupabaseService);

  it('rejects a spoofed MIME type and magic bytes', async () => {
    await expect(
      service.uploadMenuImportSource({
        vendorId: 'v',
        importId: 'i',
        file: {
          originalname: 'menu.png',
          mimetype: 'image/png',
          size: 4,
          buffer: Buffer.from('nope'),
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a PDF whose declared MIME does not contain a PDF signature', async () => {
    await expect(
      service.uploadMenuImportSource({
        vendorId: 'v',
        importId: 'i',
        file: {
          originalname: 'menu.pdf',
          mimetype: 'application/pdf',
          size: 4,
          buffer: Buffer.from('nope'),
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
