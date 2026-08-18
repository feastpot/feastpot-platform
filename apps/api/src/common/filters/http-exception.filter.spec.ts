import { Controller, Get, HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { HttpExceptionFilter } from './http-exception.filter';
import { PrismaExceptionFilter, PrismaValidationFilter } from './prisma-exception.filter';

/**
 * Minimal controller that throws a raw (non-HTTP) Error so we can confirm the
 * exception filter never echoes internal details back to the caller.
 *
 * The message is intentionally crafted to include the kinds of data that MUST
 * NOT appear in a response body: an internal file path, a database table name,
 * and text that resembles a Prisma error message.
 */
@Controller('_filter_test')
class ThrowingController {
  @Get('plain-error')
  plainError(): never {
    throw new Error(
      '/home/runner/workspace/apps/api/src/feastpass/feastpass.service.ts: ' +
        'The table `public.feast_pass_subscriptions` does not exist in the current database.',
    );
  }

  @Get('non-error')
  nonError(): never {
    // Plain-object throwable : not an Error instance.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw { secret: 'internal-value', stack: 'fake stack frame at src/foo.ts:12' };
  }
}

describe('HttpExceptionFilter - non-HTTP exception sanitisation (Part 3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ThrowingController],
    }).compile();

    app = mod.createNestApplication();
    // Filters registered in the same LIFO order as main.ts.
    // HttpExceptionFilter is first (lowest priority / catch-all fallback).
    app.useGlobalFilters(
      new HttpExceptionFilter(),
      new PrismaValidationFilter(),
      new PrismaExceptionFilter(),
    );
    await app.init();
  });

  afterAll(() => app.close());

  // -------------------------------------------------------------------------
  // Plain Error : the primary vector for internal-detail leakage
  // -------------------------------------------------------------------------
  describe('GET /_filter_test/plain-error', () => {
    let body: Record<string, unknown>;
    let status: number;

    beforeAll(async () => {
      const res = await (request(app.getHttpServer()) as request.SuperTest<request.Test>).get(
        '/_filter_test/plain-error',
      );
      status = res.status;
      body = res.body as Record<string, unknown>;
    });

    it('returns HTTP 500', () => {
      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('includes a correlationId so the log entry can be located', () => {
      expect(typeof body['correlationId']).toBe('string');
      expect((body['correlationId'] as string).length).toBeGreaterThan(4);
    });

    it('returns a generic message, not the raw error text', () => {
      expect(body['message']).toBe('An unexpected error occurred');
    });

    it('does not expose any internal file path', () => {
      const s = JSON.stringify(body);
      expect(s).not.toContain('/home/runner');
      expect(s).not.toContain('feastpass.service.ts');
    });

    it('does not expose any database table name from the error message', () => {
      expect(JSON.stringify(body)).not.toContain('feast_pass_subscriptions');
    });

    it('does not expose any Prisma-style error text', () => {
      expect(JSON.stringify(body)).not.toContain('does not exist in the current database');
    });

    it('does not contain a stack frame pattern', () => {
      // Stack frames look like "    at ClassName.method (file:line)"
      expect(JSON.stringify(body)).not.toMatch(/\bat\s+\w/);
    });
  });

  // -------------------------------------------------------------------------
  // Non-Error throwable : e.g. a plain object or string throw
  // -------------------------------------------------------------------------
  describe('GET /_filter_test/non-error', () => {
    let body: Record<string, unknown>;
    let status: number;

    beforeAll(async () => {
      const res = await (request(app.getHttpServer()) as request.SuperTest<request.Test>).get(
        '/_filter_test/non-error',
      );
      status = res.status;
      body = res.body as Record<string, unknown>;
    });

    it('returns HTTP 500', () => {
      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('includes a correlationId', () => {
      expect(typeof body['correlationId']).toBe('string');
    });

    it('does not echo the thrown object properties into the response', () => {
      const s = JSON.stringify(body);
      expect(s).not.toContain('internal-value');
      expect(s).not.toContain('fake stack frame');
    });
  });
});
