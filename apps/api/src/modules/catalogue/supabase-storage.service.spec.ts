import { BadRequestException } from '@nestjs/common';

import type { SupabaseService } from '../../auth/supabase.service';

import { SupabaseStorageService } from './supabase-storage.service';

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
