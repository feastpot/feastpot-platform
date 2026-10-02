/** Browser-only conversion. Originals never leave the browser for HEIC decoding. */
export const IMAGE_UPLOAD_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
export const DOCUMENT_UPLOAD_ACCEPT = `${IMAGE_UPLOAD_ACCEPT},application/pdf`;

export async function prepareUpload(
  file: File,
  options: { maxBytes?: number; allowPdf?: boolean } = {},
): Promise<File> {
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  if (!file.size) throw new Error('The file is empty. Choose another file.');
  if (file.size > maxBytes) throw new Error(`File exceeds ${maxBytes / 1024 / 1024} MB.`);
  const head = new Uint8Array(await file.slice(0, 40).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end));
  const png = head.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  const webp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  const heic = ascii(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(ascii(8, 40));
  const pdf = ascii(0, 5) === '%PDF-';
  const extension = file.name.split('.').pop()?.toLowerCase();
  const extensions = pdf
    ? ['pdf']
    : heic
      ? ['heic', 'heif']
      : png
        ? ['png']
        : webp
          ? ['webp']
          : ['jpg', 'jpeg'];
  if ((!pdf && !heic && !png && !jpeg && !webp) || (pdf && !options.allowPdf)) {
    throw new Error(
      `Use JPEG, PNG, WebP or HEIC${options.allowPdf ? ', or PDF' : ''}. SVG is not supported.`,
    );
  }
  if (!extension || !extensions.includes(extension)) {
    throw new Error('The filename extension does not match the file content.');
  }
  if (pdf) return file;

  let source: Blob = file;
  if (heic) {
    const { heicTo } = await import('heic-to/csp');
    source = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
  }
  // Browser decoding applies EXIF/HEIF orientation. Canvas re-encodes the
  // upright pixels and strips EXIF (including location), avoiding double rotation.
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 50_000_000) {
      throw new Error('Image exceeds the 50-megapixel limit.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the image.');
    context.drawImage(bitmap, 0, 0);
    const type = png ? 'image/png' : webp ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Image conversion failed.'))),
        type,
        0.9,
      );
    });
    if (blob.size > maxBytes)
      throw new Error(
        `Converted image exceeds ${maxBytes / 1024 / 1024} MB. Choose a smaller photo.`,
      );
    // Some browsers fall back to PNG when WebP encoding is unsupported.
    const suffix = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${suffix}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
