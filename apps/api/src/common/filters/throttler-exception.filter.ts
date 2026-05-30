import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';

/**
 * Dedicated 429 filter. ThrottlerException extends HttpException, so without
 * this it falls through to the catch-all HttpExceptionFilter and surfaces the
 * library's raw "ThrottlerException: Too Many Requests" message. Nest reverses
 * global filters and picks the first @Catch() match, so this is registered AFTER
 * the catch-all HttpExceptionFilter in main.ts to be evaluated first; it returns
 * a friendly message in the SAME error envelope the rest of the API uses
 * ({ code, message, statusCode, timestamp, path }).
 *
 * RoleThrottlerGuard (via @nestjs/throttler v6) already sets the `Retry-After`
 * header to the real seconds-until-unblock before throwing, so we read that
 * accurate value rather than guessing - ThrottlerException itself carries no
 * ttl in v6 - and echo it into the body as `retryAfter` for clients that read
 * JSON rather than headers. Falls back to the 60s long-window ceiling.
 */
@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const headerRetry = Number(response.getHeader('Retry-After'));
    const retryAfter = Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : 60;
    response.setHeader('Retry-After', retryAfter.toString());

    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      code: 'TooManyRequests',
      message: 'You have made too many requests. Please wait before trying again.',
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      timestamp: new Date().toISOString(),
      path: request.url,
      retryAfter,
    });
  }
}
