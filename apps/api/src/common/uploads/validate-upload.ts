import { BadRequestException } from '@nestjs/common';

export interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Always validate BEFORE storage. Do not trust MIME, extension or reported size. */
export function validateUpload(file: UploadFile, maxBytes: number, allowPdf = false): void {
  const invalid = (code: string, message: string): never => {
    throw new BadRequestException({ code, message });
  };
  const bytes = file.buffer;
  if (!bytes?.length) invalid('FILE_EMPTY', 'Empty files are not supported');
  if (bytes.length > maxBytes || file.size > maxBytes) {
    invalid('FILE_TOO_LARGE', `Max ${maxBytes / 1024 / 1024} MB per file`);
  }
  if (file.size !== bytes.length) invalid('INVALID_FILE_SIZE', 'File size does not match content');
  let detected: string | undefined;
  if (bytes.length >= 12) {
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) detected = 'image/jpeg';
    else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      detected = 'image/png';
    else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
      detected = 'image/webp';
    else if (allowPdf && /^%PDF-\d\.\d/.test(bytes.toString('ascii', 0, 8)))
      detected = 'application/pdf';
  }
  if (!detected)
    invalid(
      'INVALID_FILE_CONTENT',
      'Use valid JPEG, PNG or WebP images, or PDF where allowed. Convert HEIC in your browser. SVG is not supported.',
    );
  const extensions: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'application/pdf': ['pdf'],
  };
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  if (file.mimetype !== detected || !extension || !extensions[detected!].includes(extension)) {
    invalid('FILE_TYPE_MISMATCH', 'File content, MIME type and extension must match');
  }
  if (detected === 'application/pdf' && !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) {
    invalid('INVALID_FILE_CONTENT', 'Incomplete PDF file');
  }
  if (
    detected === 'image/png' &&
    (bytes.length < 33 || bytes.toString('ascii', 12, 16) !== 'IHDR')
  ) {
    invalid('INVALID_FILE_CONTENT', 'Incomplete PNG file');
  }
  if (
    detected === 'image/jpeg' &&
    (bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217)
  ) {
    invalid('INVALID_FILE_CONTENT', 'Incomplete JPEG file');
  }
}
