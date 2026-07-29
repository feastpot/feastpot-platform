import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { SupabaseService } from '../../auth/supabase.service';

import { STORAGE_BUCKET } from './catalogue.constants';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

/** Magic-byte sniff for the three formats we accept. */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return true;
  // WebP: "RIFF" .... "WEBP"
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP')
    return true;
  return false;
}

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

  /**
   * Customer review photos. Stored under the vendor's folder so vendor
   * deletion tooling can sweep everything vendor-related in one prefix.
   */
  async uploadReviewPhoto(params: {
    vendorId: string;
    reviewId: string;
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  }): Promise<UploadedImage> {
    const { vendorId, reviewId, file } = params;
    return this.uploadAt(`vendors/${vendorId}/reviews/${reviewId}`, file);
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
    // The declared MIME type is client-controlled, so also sniff the magic
    // bytes - a non-image payload with a spoofed image/* header must not land
    // in public storage.
    if (!looksLikeImage(file.buffer)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_CONTENT',
        message: 'File content is not a valid JPEG, PNG, or WebP image',
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
