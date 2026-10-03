import { randomBytes } from 'crypto';

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { AuthUser } from '../../auth/types';
import { ErrorIncidentsService } from '../../modules/error-incidents/error-incidents.service';

interface ErrorBody {
  code: string;
  message: string;
  statusCode: number;
  /** Opaque 16-hex-char id that ties this response to the server-side log entry.
   *  Engineers can grep for it in Sentry / CloudWatch without exposing internals. */
  correlationId: string;
  timestamp: string;
  path: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  constructor(private readonly incidents?: ErrorIncidentsService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Unique id per error occurrence so the client can quote it and an
    // engineer can find the exact log entry (Sentry event, log stream, etc.)
    // without any internal detail escaping into the HTTP response body.
    const correlationId = randomBytes(8).toString('hex');

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = exception.name;
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const r = res as { message?: unknown; error?: string; code?: string };
        if (r.code && typeof r.code === 'string') code = r.code;
        if (typeof r.message === 'string') {
          message = r.message;
        } else if (Array.isArray(r.message)) {
          message = (r.message as string[]).join('; ');
          details = r.message;
        } else {
          message = exception.message;
        }
      } else {
        message = exception.message;
      }

      if (statusCode >= 500) {
        this.logger.error(
          `[${correlationId}] ${request.method} ${request.url} -> ${statusCode}: ${message}`,
        );
      }
    } else if (exception instanceof Error) {
      // Non-HTTP exceptions (Prisma errors not caught by their specific filters,
      // unexpected library errors, etc.) must NEVER expose their raw message or
      // stack in the response body: Prisma messages include table names and file
      // paths; other framework errors may include stack frames.
      //
      // Full detail is logged server-side keyed by correlationId so engineers
      // can find it from the client-quoted id without any information escaping
      // to end users or being visible in network inspector tabs.
      this.logger.error(
        `[${correlationId}] Unhandled ${exception.constructor.name}: ${exception.message}`,
        exception.stack,
      );
      // message, code, statusCode keep their safe defaults (500 / generic text)
    } else {
      // Non-Error throwables (plain objects, strings, etc.)
      this.logger.error(`[${correlationId}] Unknown exception type: ${String(exception)}`);
    }

    // An HttpException is not a trust boundary: services can wrap provider text
    // in a 400/404 just as easily as they can accidentally expose a 500.
    const messages: Record<number, string> = {
      400: 'Please check your information and try again.',
      401: 'Please sign in again to continue.',
      403: 'You do not have permission to do this.',
      404: 'We could not find the requested item.',
      409: 'This information has changed. Please refresh and try again.',
      422: 'Please check your information and try again.',
      429: 'You have made too many requests. Please wait before trying again.',
    };
    let ref: string | null = null;
    const error = exception as { message?: string; stack?: string; cause?: unknown };
    const seen = new WeakSet<object>();
    const diagnostic = JSON.stringify(
      {
        message: error?.message ?? String(exception),
        stack: error?.stack,
        cause: error?.cause,
        response: exception instanceof HttpException ? exception.getResponse() : undefined,
      },
      (_key, value: unknown) => {
        if (typeof value === 'bigint') return String(value);
        if (value && typeof value === 'object') {
          if (seen.has(value)) return '[circular]';
          seen.add(value);
        }
        return value instanceof Error
          ? {
              ...value,
              name: value.name,
              message: value.message,
              stack: value.stack,
              cause: value.cause,
            }
          : value;
      },
    );
    if (this.incidents && !request.url.startsWith('/v1/error-incidents')) {
      try {
        const principal = (request as Request & { user?: AuthUser }).user ?? null;
        const incident = await this.incidents.create(
          {
            app:
              principal?.role === 'vendor'
                ? 'vendor'
                : principal && principal.role !== 'customer'
                  ? 'admin'
                  : 'web',
            route: request.url.split('?')[0] ?? '/',
            message: error?.message ?? 'Unknown exception',
            detail: diagnostic.slice(0, 20000),
          },
          principal,
        );
        ref = incident.ref;
      } catch {
        this.logger.error({ event: 'incident_persistence_failed', correlationId });
      }
    }
    this.logger.error({ event: 'http_exception', ref, correlationId, statusCode, diagnostic });
    message = messages[statusCode] ?? 'We could not complete this request. Please try again.';
    details = undefined;
    const body: ErrorBody & { ref: string | null; retryAfter?: number } = {
      code,
      message,
      statusCode,
      correlationId,
      ref,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(details !== undefined ? { details } : {}),
      ...(statusCode === 429
        ? { retryAfter: Number(response.getHeader?.('Retry-After')) || 60 }
        : {}),
    };

    response.status(statusCode).json(body);
  }
}
