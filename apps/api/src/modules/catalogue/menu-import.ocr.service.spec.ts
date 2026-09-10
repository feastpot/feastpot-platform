import { execFile } from 'node:child_process';

import { BadRequestException } from '@nestjs/common';

import { MenuImportOcrService } from './menu-import.ocr.service';

jest.mock('node:child_process', () => {
  const fn = jest.fn();
  Object.defineProperty(fn, Symbol.for('nodejs.util.promisify.custom'), {
    value: (command: string, args: string[], options: unknown) =>
      new Promise((resolve, reject) =>
        fn(command, args, options, (error: unknown, result: unknown) =>
          error ? reject(error) : resolve(result),
        ),
      ),
  });
  return { execFile: fn };
});

const mockedExecFile = execFile as unknown as jest.Mock;
type ExecCallback = (error: unknown, result: unknown) => void;

describe('MenuImportOcrService PDF preflight', () => {
  beforeEach(() => {
    mockedExecFile.mockImplementation(
      (command: string, args: string[], _options: unknown, callback: ExecCallback) => {
        const output =
          command === 'pdfinfo' && args.includes('-f')
            ? 'Page size: 612 x 792 pts (letter)\n'
            : command === 'pdfinfo'
              ? 'Pages: 1\nPage size: 612 x 792 pts (letter)\n'
              : command === 'file'
                ? 'JPEG image data, 1000 x 1000'
                : '';
        callback(null, { stdout: output, stderr: '' });
      },
    );
  });

  it('preflights every page and renders a normal PDF through prlimit', async () => {
    const service = new MenuImportOcrService();
    const result = await service.extract({
      buffer: Buffer.from('%PDF-1.7'),
      mimetype: 'application/pdf',
      originalname: 'menu.pdf',
    });
    expect(result).toEqual([]);
    expect(mockedExecFile).toHaveBeenCalledWith(
      'prlimit',
      expect.arrayContaining(['--', 'pdftoppm']),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('rejects an oversized projected page before rendering', async () => {
    mockedExecFile.mockImplementation(
      (command: string, args: string[], _options: unknown, callback: ExecCallback) => {
        const output =
          command === 'pdfinfo' && args.includes('-f')
            ? 'Page size: 4800 x 4800 pts\n'
            : command === 'pdfinfo'
              ? 'Pages: 1\nPage size: 4800 x 4800 pts\n'
              : '';
        callback(null, { stdout: output, stderr: '' });
      },
    );
    const service = new MenuImportOcrService();
    await expect(
      service.extract({
        buffer: Buffer.from('%PDF-1.7'),
        mimetype: 'application/pdf',
        originalname: 'large.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedExecFile).not.toHaveBeenCalledWith(
      'prlimit',
      expect.anything(),
      expect.anything(),
    );
  });

  it('rejects an oversized later page before rendering', async () => {
    mockedExecFile.mockImplementation(
      (command: string, args: string[], _options: unknown, callback: ExecCallback) => {
        const output =
          command === 'pdfinfo' && args.includes('-f')
            ? args.includes('2')
              ? 'Page size: 4800 x 4800 pts\n'
              : 'Page size: 612 x 792 pts\n'
            : command === 'pdfinfo'
              ? 'Pages: 2\nPage size: 612 x 792 pts\n'
              : '';
        callback(null, { stdout: output, stderr: '' });
      },
    );
    const service = new MenuImportOcrService();
    await expect(
      service.extract({
        buffer: Buffer.from('%PDF-1.7'),
        mimetype: 'application/pdf',
        originalname: 'later.pdf',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedExecFile).not.toHaveBeenCalledWith(
      'prlimit',
      expect.anything(),
      expect.anything(),
    );
  });
});
