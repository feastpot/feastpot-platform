import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { mergeMap, Observable } from 'rxjs';

import type { AuthUser } from '../../auth/types';
import { ErrorIncidentsService } from '../../modules/error-incidents/error-incidents.service';

const fields: Record<string, string> = {
  error: 'Could not complete this operation.',
  errorMessage: 'Could not complete this operation.',
  failedReason: 'This background task failed.',
  lastError: 'Could not complete this operation.',
  failureReason: 'Could not complete this operation.',
};

/**
 * Successful list/detail endpoints also carry historical provider failures
 * (payments, notification outbox, menu imports, queue jobs). They never pass
 * through an exception filter. Keep those diagnostics private as well.
 */
@Injectable()
export class UserErrorFieldsInterceptor implements NestInterceptor {
  private readonly incidents = new Map<string, Promise<string | null>>();
  constructor(private readonly service: ErrorIncidentsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ url: string; user?: AuthUser }>();
    if (request.url.startsWith('/v1/error-incidents')) return next.handle();
    return next
      .handle()
      .pipe(mergeMap((body: unknown) => this.sanitize(body, request.url, request.user ?? null)));
  }

  async sanitize(value: unknown, route: string, principal: AuthUser | null): Promise<unknown> {
    if (Array.isArray(value))
      return Promise.all(value.map((item) => this.sanitize(item, route, principal)));
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
      return value;
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const diagnostics: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if ((key === 'stack' || key === 'stacktrace') && item) {
        diagnostics[key] = item;
        continue;
      }
      if (fields[key] && typeof item === 'string' && item.length > 0) {
        diagnostics[key] = item;
        output[key] = fields[key];
      } else {
        output[key] = await this.sanitize(item, route, principal);
      }
    }
    if (Object.keys(diagnostics).length) {
      const detail = JSON.stringify(diagnostics);
      const cacheKey = `${principal?.id ?? 'anonymous'}|${route}|${detail}`;
      let incident = this.incidents.get(cacheKey);
      if (!incident) {
        incident = this.service
          .create(
            {
              app:
                principal?.role === 'vendor'
                  ? 'vendor'
                  : principal && principal.role !== 'customer'
                    ? 'admin'
                    : 'web',
              route: route.split('?')[0] ?? '/',
              message: 'A previous operation failed',
              detail: detail.slice(0, 20000),
            },
            principal,
          )
          .then((row) => row.ref)
          .catch(() => null);
        if (this.incidents.size >= 256) this.incidents.delete(this.incidents.keys().next().value!);
        this.incidents.set(cacheKey, incident);
        // Do not cache failed persistence indefinitely.
        void incident.then((ref) => {
          if (!ref) this.incidents.delete(cacheKey);
        });
      }
      const ref = await incident;
      output.errorRef = ref;
      for (const key of Object.keys(diagnostics)) {
        if (fields[key])
          output[key] =
            `${fields[key]} ${ref ? `Ref: ${ref}` : 'Support reference unavailable. Please contact support.'}`;
      }
    }
    return output;
  }
}
