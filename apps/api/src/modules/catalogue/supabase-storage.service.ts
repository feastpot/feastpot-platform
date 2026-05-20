import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { SupabaseService } from '../../auth/supabase.service';

import { STORAGE_BUCKET } from './catalogue.constants';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  path: string;
  publicUrl: string;
}

/**
 * Thin wrapper around Supabase Storage for menu item images.
 * Uses the service-role client from SupabaseService.
 */
@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async uploadMenuItemImage(params: {
    vendorId: string;
    itemId: string;
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  }): Promise<UploadedImage> {
    const { vendorId, itemId, file } = params;
    return this.uploadAt(`vendors/${vendorId}/menu/${itemId}`, file);
  }

  /**
   * T005: logo + cover uploads for the vendor business profile editor.
   * The path includes a millisecond timestamp so re-uploads don't collide and
   * old URLs keep resolving while the new one is rolled out.
   */
  async uploadVendorImage(params: {
    vendorId: string;
    kind: 'logo' | 'cover';
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  }): Promise<UploadedImage> {
    const { vendorId, kind, file } = params;
    return this.uploadAt(`vendors/${vendorId}/identity/${kind}`, file);
  }

  private async uploadAt(
    folder: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<UploadedImage> {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_TYPE',
        message: `Unsupported image type ${file.mimetype}; allowed: ${Array.from(ALLOWED_MIME).join(', ')}`,
      });
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException({
        code: 'IMAGE_TOO_LARGE',
        message: `Image exceeds ${MAX_BYTES} bytes`,
      });
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const filename = `${Date.now()}-${safeName}`;
    const path = `${folder}/${filename}`;

    const storage = this.supabase.getClient().storage.from(STORAGE_BUCKET);
    const { error } = await storage.upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`);
      throw new InternalServerErrorException({
        code: 'IMAGE_UPLOAD_FAILED',
        message: 'Could not upload image',
      });
    }

    const { data } = storage.getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }
}
