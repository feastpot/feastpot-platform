import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

import { validateUpload } from './validate-upload';

export interface NormalisableUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * The browser handles HEIC. The API only decodes already validated JPEG,
 * PNG and WebP, rotates their pixels, and strips metadata (including GPS).
 * Apply this before every storage writer, including private originals.
 */
export async function normaliseUpload<T extends NormalisableUpload>(
  file: T,
  maxBytes: number,
  allowPdf = false,
): Promise<T> {
  validateUpload(file, maxBytes, allowPdf);
  if (file.mimetype === 'application/pdf') return file;
  let buffer: Buffer;
  try {
    buffer = await sharp(file.buffer, { limitInputPixels: 50_000_000, failOn: 'error' })
      .rotate()
      .toBuffer();
  } catch (cause) {
    throw new BadRequestException(
      {
        code: 'INVALID_IMAGE_CONTENT',
        message: 'This image could not be read. Choose a valid JPEG, PNG or WebP photo.',
      },
      { cause },
    );
  }
  if (buffer.length > maxBytes) {
    throw new BadRequestException({
      code: 'FILE_TOO_LARGE',
      message: `The prepared image exceeds ${maxBytes / 1024 / 1024} MB. Choose a smaller photo.`,
    });
  }
  return { ...file, buffer, size: buffer.length };
}
