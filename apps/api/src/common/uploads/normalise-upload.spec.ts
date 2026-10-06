import sharp from 'sharp';

import { normaliseUpload } from './normalise-upload';

const limit = 10 * 1024 * 1024;
const upload = (buffer: Buffer, mimetype = 'image/jpeg', originalname = 'photo.jpg') => ({
  buffer,
  size: buffer.length,
  mimetype,
  originalname,
});

describe('normaliseUpload ingestion boundary', () => {
  it('rotates orientation-6 JPEG pixels before storage and removes all EXIF', async () => {
    const source = await sharp({
      create: { width: 16, height: 10, channels: 3, background: '#128a7c' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const before = await sharp(source).metadata();
    expect(before.orientation).toBe(6);
    const result = await normaliseUpload(upload(source), limit);
    const after = await sharp(result.buffer).metadata();
    expect([after.width, after.height]).toEqual([10, 16]);
    expect(after.orientation).toBeUndefined();
    expect(after.exif).toBeUndefined();
    expect(result.size).toBe(result.buffer.length);
  });

  it.each(['png', 'webp'] as const)(
    'preserves %s aspect ratio and strips metadata',
    async (format) => {
      const source = await sharp({
        create: { width: 24, height: 16, channels: 3, background: '#128a7c' },
      })
        .withMetadata()
        [format]()
        .toBuffer();
      const result = await normaliseUpload(
        upload(source, `image/${format}`, `photo.${format}`),
        limit,
      );
      const after = await sharp(result.buffer).metadata();
      expect([after.width, after.height]).toEqual([24, 16]);
      expect(after.exif).toBeUndefined();
    },
  );

  it('leaves allowed PDF bytes unchanged and rejects PDF on image-only paths', async () => {
    const file = upload(Buffer.from('%PDF-1.4\nfixture\n%%EOF'), 'application/pdf', 'file.pdf');
    expect(await normaliseUpload(file, limit, true)).toBe(file);
    await expect(normaliseUpload(file, limit)).rejects.toThrow();
  });

  it.each([
    upload(Buffer.alloc(0)),
    upload(Buffer.alloc(limit + 1)),
    upload(Buffer.from('<svg/>'), 'image/svg+xml', 'photo.svg'),
    upload(Buffer.from('spoofed image')),
    upload(Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    upload(Buffer.from('%PDF-1.4'), 'application/pdf', 'photo.jpg'),
    upload(Buffer.from('0000ftypheic0000'), 'image/heic', 'photo.heic'),
  ])('rejects invalid or unconverted input before storage', async (file) => {
    await expect(normaliseUpload(file, limit, true)).rejects.toThrow();
  });
});
