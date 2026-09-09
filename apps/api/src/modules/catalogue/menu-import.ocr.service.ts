import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';

import { parseMenuText, ParsedMenuCandidate } from './menu-import.parser';

const run = promisify(execFile);
const DEADLINE = 45_000;
const MAX_PAGES = 10;
const MAX_OUTPUT = 2 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
const MAX_DIMENSION = 10_000;
const RENDER_DPI = 150;
const RENDER_ADDRESS_SPACE = 512 * 1024 * 1024;

/** Bound expensive native OCR processes across all concurrent HTTP requests. */
class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(
    private readonly limit: number,
    private readonly maxWaiters: number,
  ) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    if (this.waiters.length >= this.maxWaiters)
      throw new HttpException(
        {
          code: 'OCR_BUSY',
          message: 'OCR capacity is temporarily exhausted; retry shortly',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    return () => this.release();
  }
  private release() {
    this.active -= 1;
    this.waiters.shift()?.();
  }
}
const OCR_SLOTS = new Semaphore(2, 8);

@Injectable()
export class MenuImportOcrService implements OnModuleInit {
  private toolsReady?: Promise<void>;

  onModuleInit() {
    this.toolsReady = this.assertTools();
  }

  async extract(file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }): Promise<ParsedMenuCandidate[]> {
    const started = Date.now();
    const release = await OCR_SLOTS.acquire();
    if (Date.now() - started >= DEADLINE) {
      release();
      throw new InternalServerErrorException({
        code: 'OCR_TIMEOUT',
        message: 'OCR deadline exceeded',
      });
    }
    const remaining = () => Math.max(1, DEADLINE - (Date.now() - started));
    const dir = await mkdtemp(join(tmpdir(), 'feastpot-menu-'));
    try {
      await (this.toolsReady ??= this.assertTools());
      const input = join(dir, 'source');
      await writeFile(input, file.buffer);
      const images: string[] = [];
      if (file.mimetype === 'application/pdf') {
        let info;
        try {
          info = await this.command('pdfinfo', [input], remaining());
        } catch {
          throw new BadRequestException({
            code: 'PDF_RENDER_FAILED',
            message: 'Could not inspect PDF for OCR',
          });
        }
        const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
        if (!Number.isInteger(pages) || pages < 1)
          throw new BadRequestException({
            code: 'PDF_RENDER_FAILED',
            message: 'Could not inspect PDF for OCR',
          });
        if (pages > MAX_PAGES)
          throw new BadRequestException({
            code: 'PDF_TOO_MANY_PAGES',
            message: `PDFs may contain at most ${MAX_PAGES} pages`,
          });
        // pdfinfo's summary size is not sufficient: PDFs may contain an
        // oversized later page. Inspect every page before starting pdftoppm.
        for (let page = 1; page <= pages; page += 1) {
          const pageInfo = await this.command(
            'pdfinfo',
            ['-f', String(page), '-l', String(page), input],
            remaining(),
          );
          const dimensions = pageInfo.stdout.match(/Page size:\s*([\d.]+)\s*x\s*([\d.]+)/i);
          if (!dimensions) {
            throw new BadRequestException({
              code: 'PDF_INVALID_DIMENSIONS',
              message: 'Could not verify PDF page dimensions',
            });
          }
          const width = Math.ceil(Number(dimensions[1]) * (RENDER_DPI / 72));
          const height = Math.ceil(Number(dimensions[2]) * (RENDER_DPI / 72));
          if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width < 1 ||
            height < 1 ||
            width > MAX_DIMENSION ||
            height > MAX_DIMENSION ||
            width * height > MAX_PIXELS
          ) {
            throw new BadRequestException({
              code: 'PDF_DIMENSIONS_TOO_LARGE',
              message: 'PDF page dimensions are too large',
            });
          }
        }
        try {
          await this.command(
            'prlimit',
            [
              `--as=${RENDER_ADDRESS_SPACE}`,
              '--',
              'pdftoppm',
              '-f',
              '1',
              '-l',
              String(pages),
              '-jpeg',
              '-r',
              String(RENDER_DPI),
              '-scale-to',
              String(MAX_DIMENSION),
              input,
              join(dir, 'page'),
            ],
            remaining(),
          );
        } catch {
          throw new BadRequestException({
            code: 'PDF_RENDER_FAILED',
            message: 'Could not render PDF for OCR',
          });
        }
        images.push(
          ...(await readdir(dir))
            .filter((x) => /^page-\d+\.jpg$/.test(x))
            .sort()
            .map((x) => join(dir, x)),
        );
        const outputBytes = (
          await Promise.all(images.map(async (image) => (await stat(image)).size))
        ).reduce((sum, size) => sum + size, 0);
        if (outputBytes > 40 * 1024 * 1024)
          throw new BadRequestException({
            code: 'PDF_OUTPUT_TOO_LARGE',
            message: 'Rendered PDF output is too large',
          });
      } else {
        images.push(input);
      }
      if (images.length > MAX_PAGES)
        throw new BadRequestException({
          code: 'TOO_MANY_PAGES',
          message: 'Too many pages for OCR',
        });
      let text = '';
      for (const image of images) {
        await this.assertImageBounds(image, remaining());
        try {
          const result = await this.command(
            'tesseract',
            [image, 'stdout', '--psm', '6'],
            remaining(),
          );
          text += `${result.stdout}\n`;
          if (text.length > MAX_OUTPUT)
            throw new BadRequestException({
              code: 'OCR_OUTPUT_TOO_LARGE',
              message: 'OCR output is too large',
            });
        } catch (error) {
          if (error instanceof BadRequestException) throw error;
          throw new InternalServerErrorException({
            code: 'OCR_FAILED',
            message: 'Local OCR failed',
          });
        }
      }
      return parseMenuText(text);
    } finally {
      release();
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async assertTools() {
    for (const tool of ['tesseract', 'file', 'pdfinfo', 'pdftoppm', 'prlimit']) {
      try {
        await this.command(tool, ['-v'], 5_000);
      } catch {
        throw new InternalServerErrorException({
          code: 'OCR_TOOL_UNAVAILABLE',
          message: 'Required local OCR tools are unavailable',
        });
      }
    }
  }

  private async assertImageBounds(path: string, timeout: number) {
    let output: string;
    try {
      output = (await this.command('file', ['-b', path], timeout)).stdout;
    } catch {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_DIMENSIONS',
        message: 'Could not inspect image dimensions',
      });
    }
    const match = output.match(/(\d+)\s*x\s*(\d+)/);
    if (!match)
      throw new BadRequestException({
        code: 'INVALID_IMAGE_DIMENSIONS',
        message: 'Image dimensions could not be verified',
      });
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (
      width < 1 ||
      height < 1 ||
      width > MAX_DIMENSION ||
      height > MAX_DIMENSION ||
      width * height > MAX_PIXELS
    )
      throw new BadRequestException({
        code: 'IMAGE_DIMENSIONS_TOO_LARGE',
        message: 'Image dimensions are too large',
      });
  }

  private command(command: string, args: string[], timeout: number) {
    return run(command, args, { timeout: Math.max(1, timeout), maxBuffer: MAX_OUTPUT });
  }
}
