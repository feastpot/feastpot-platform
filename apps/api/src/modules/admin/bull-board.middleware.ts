import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

/**
 * HTTP Basic Auth gate for the Bull Board UI mounted at `/admin/queues`.
 *
 * Bull Board registers its router via `BullBoardRootModule.configure(consumer)`
 * which accepts a single `middleware` option in `forRoot`. We pass this factory
 * via `BullBoardModule.forRootAsync` so it can read `BULL_BOARD_PASSWORD` from
 * `ConfigService`.
 *
 * If `BULL_BOARD_PASSWORD` is unset, the dashboard returns 503 (locked) rather
 * than serving unauthenticated.
 */
export function bullBoardBasicAuth(config: ConfigService) {
  const logger = new Logger('BullBoardAuth');
  const username = config.get<string>('BULL_BOARD_USERNAME') ?? 'admin';
  const password = config.get<string>('BULL_BOARD_PASSWORD');
  const realm = 'Feastpot Bull Board';

  if (!password) {
    logger.warn(
      'BULL_BOARD_PASSWORD is not set — /admin/queues will return 503 until configured.',
    );
  }

  return function bullBoardAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!password) {
      res.status(503).send('Bull Board disabled: BULL_BOARD_PASSWORD not set on the server.');
      return;
    }

    const header = req.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
      const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
      if (user === username && pass === password) {
        next();
        return;
      }
    }

    res.setHeader('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
    res.status(401).send('Authentication required.');
  };
}
