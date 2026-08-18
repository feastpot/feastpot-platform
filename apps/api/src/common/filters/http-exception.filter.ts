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

  catch(exception: unknown, host: ArgumentsHost): void {
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

    const body: ErrorBody = {
      code,
      message,
      statusCode,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(details !== undefined ? { details } : {}),
    };

    response.status(statusCode).json(body);
  }
}
