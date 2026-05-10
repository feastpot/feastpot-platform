import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from './auth/decorators/public.decorator';

/**
 * Version-neutral root controller. The rest of the API is mounted under
 * `/v1/...` via `app.enableVersioning(URI)`, but Cloud Run / autoscale's
 * default startup probe pings `GET /` and requires HTTP 200. Without this,
 * the probe gets a 404 from `HttpExceptionFilter`, fails enough times in a
 * row, and the Promote phase aborts — exactly the failure mode we just
 * debugged. Keeping the response tiny (no DB hit) means the probe stays
 * fast even under cold-start load.
 *
 * `GET /healthz` is the same payload exposed at an unversioned path so
 * external monitoring (UptimeRobot, BetterStack, etc.) doesn't need to know
 * about the `/v1` prefix.
 */
@ApiExcludeController()
@Controller({ path: '', version: VERSION_NEUTRAL })
export class RootController {
  @Public()
  @Get()
  root() {
    return {
      name: 'Feastpot API',
      status: 'ok',
      docs: '/v1/health',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('healthz')
  healthz() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
