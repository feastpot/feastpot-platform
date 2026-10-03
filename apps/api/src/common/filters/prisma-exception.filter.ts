import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger , HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ErrorIncidentsService } from '../../modules/error-incidents/error-incidents.service';

import { HttpExceptionFilter } from './http-exception.filter';

/**
 * D22: catches every Prisma `KnownRequestError` that isn't already
 * translated to an HttpException by the calling service. Without this,
 * uncaught codes like P2025 / P2003 / P2014 leak full Prisma metadata
 * (`meta`, `clientVersion`, table & constraint names) in the 500 body.
 *
 * Service-level try/catch translations (e.g. `discount-codes.adminCreate`
 * mapping P2002 → `DISCOUNT_CODE_EXISTS`) still take precedence - those
 * blocks throw an HttpException, which never reaches this filter.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);
  constructor(private readonly incidents?: ErrorIncidentsService) {}

  async catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): Promise<void> {
    let status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let code = 'INTERNAL_ERROR';

    switch (exception.code) {
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'The requested resource was not found';
        code = 'NOT_FOUND';
        break;
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'A record with these details already exists';
        code = 'CONFLICT';
        break;
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced resource does not exist';
        code = 'FOREIGN_KEY_CONSTRAINT';
        break;
      case 'P2014':
        status = HttpStatus.BAD_REQUEST;
        message = 'This operation violates a data relationship constraint';
        code = 'RELATION_CONSTRAINT';
        break;
      case 'P2016':
        status = HttpStatus.BAD_REQUEST;
        message = 'Query interpretation error';
        code = 'QUERY_INTERPRETATION';
        break;
      default:
        // Log the full Prisma payload server-side (meta, target, etc.) so
        // engineers can debug, but never include it in the response body.
        this.logger.error(`[Prisma] Unhandled error ${exception.code}: ${exception.message}`, {
          meta: exception.meta,
        });
    }

    await new HttpExceptionFilter(this.incidents).catch(
      new HttpException({ code, message }, status, { cause: exception }),
      host,
    );
  }
}

/**
 * `PrismaClientValidationError` is thrown when a query is malformed
 * (e.g. unknown field, wrong scalar type). It carries the full schema
 * shape in its message - must never be exposed.
 */
@Catch(Prisma.PrismaClientValidationError)
export class PrismaValidationFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaValidationFilter.name);
  constructor(private readonly incidents?: ErrorIncidentsService) {}

  async catch(exception: Prisma.PrismaClientValidationError, host: ArgumentsHost): Promise<void> {
    this.logger.error(`[Prisma] Validation error: ${exception.message}`);

    await new HttpExceptionFilter(this.incidents).catch(
      new HttpException(
        { code: 'BAD_REQUEST', message: 'Please check your information.' },
        HttpStatus.BAD_REQUEST,
        { cause: exception },
      ),
      host,
    );
  }
}
