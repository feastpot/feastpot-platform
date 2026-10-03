import { BadRequestException } from '@nestjs/common';

import { validateUpload, type UploadFile } from './validate-upload';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const file = (bytes: Buffer, name = 'image.png', mime = 'image/png'): UploadFile => ({
  buffer: bytes,
  size: bytes.length,
  originalname: name,
  mimetype: mime,
});

describe('upload content boundary', () => {
  it('accepts matching PNG bytes', () =>
    expect(() => validateUpload(file(png), 1000)).not.toThrow());
  it.each([
    ['empty', file(Buffer.alloc(0))],
    ['text renamed PNG', file(Buffer.from('not an image'))],
    ['SVG', file(Buffer.from('<svg onload="alert(1)"/>'), 'image.svg', 'image/svg+xml')],
    ['spoofed MIME', file(png, 'image.png', 'image/jpeg')],
    ['spoofed extension', file(png, 'image.jpg', 'image/png')],
    ['reported size', { ...file(png), size: 1 }],
  ])('rejects %s before any storage access', (_label, input) => {
    expect(() => validateUpload(input, 1000)).toThrow(BadRequestException);
  });
  it('uses actual bytes for the limit', () =>
    expect(() => validateUpload({ ...file(Buffer.alloc(1001)), size: 1 }, 1000)).toThrow('Max'));
  it('accepts PDF only on document paths', () => {
    const pdf = file(Buffer.from('%PDF-1.4\nfixture\n%%EOF'), 'document.pdf', 'application/pdf');
    expect(() => validateUpload(pdf, 1000, true)).not.toThrow();
    expect(() => validateUpload(pdf, 1000)).toThrow(BadRequestException);
  });
  it('rejects truncated PDF', () =>
    expect(() =>
      validateUpload(
        file(Buffer.from('%PDF-1.4\nfixture'), 'document.pdf', 'application/pdf'),
        1000,
        true,
      ),
    ).toThrow('Incomplete'));
});
