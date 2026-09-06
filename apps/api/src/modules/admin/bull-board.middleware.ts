import { createHmac, timingSafeEqual } from 'node:crypto';

import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

const TOKEN_TTL_SECONDS = 5 * 60;
const COOKIE_NAME = 'feastpot_queue_board';

interface QueueBoardClaims {
  sub: string;
  exp: number;
}

function secret(config: ConfigService): string {
  const value = config.get<string>('SESSION_SECRET');
  if (!value) throw new Error('SESSION_SECRET is required to secure the queue dashboard');
  return value;
}

function signature(payload: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(payload).digest('base64url');
}

function issueBullBoardToken(config: ConfigService, userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }),
    'utf8',
  ).toString('base64url');
  return `${payload}.${signature(payload, secret(config))}`;
}

function claimsFor(token: string | undefined, signingSecret: string): QueueBoardClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, received] = parts;
  if (!payload || !received) return null;
  const expected = signature(payload, signingSecret);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as QueueBoardClaims;
    return typeof claims.sub === 'string' &&
      claims.sub.length > 0 &&
      typeof claims.exp === 'number' &&
      Number.isFinite(claims.exp) &&
      claims.exp > Date.now() / 1000
      ? claims
      : null;
  } catch {
    return null;
  }
}

function cookie(req: Request): string | undefined {
  return req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
}

export function setBullBoardSessionCookie(
  config: ConfigService,
  res: Response,
  userId: string,
): void {
  res.cookie(COOKIE_NAME, issueBullBoardToken(config, userId), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin/queues',
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
}

/**
 * A short-lived token is issued only by the authenticated AAL2 admin API. It
 * is exchanged for an HttpOnly same-site cookie for the embedded Bull Board,
 * including its asset requests and queue-control actions.
 */
export function bullBoardSessionAuth(config: ConfigService) {
  const signingSecret = secret(config);
  return function bullBoardSessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const token = cookie(req);
    const claims = claimsFor(token, signingSecret);
    if (!claims) {
      res
        .status(401)
        .send('An authenticated admin session is required to access the queue dashboard.');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.locals.queueBoardActorId = claims.sub;
    next();
  };
}
