import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

import { bullBoardSessionAuth, setBullBoardSessionCookie } from './bull-board.middleware';

function config(secret = 'test-session-secret'): ConfigService {
  return {
    get: jest.fn((key: string) => (key === 'SESSION_SECRET' ? secret : undefined)),
  } as unknown as ConfigService;
}

function response() {
  return {
    cookie: jest.fn(),
    locals: {},
    redirect: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('Bull Board session middleware', () => {
  it('rejects missing and tampered tokens', () => {
    const middleware = bullBoardSessionAuth(config());
    for (const token of [undefined, 'invalid.token']) {
      const req = { headers: {}, query: token ? { access: token } : {} } as unknown as Request;
      const res = response();
      middleware(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });

  it('sets a signed HttpOnly session cookie without exposing a bearer token', () => {
    const cfg = config();
    const res = response();
    setBullBoardSessionCookie(cfg, res, 'admin-user');

    expect(res.cookie).toHaveBeenCalledWith(
      'feastpot_queue_board',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/admin/queues' }),
    );
  });

  it('accepts the signed cookie and exposes the actor to the board request', () => {
    const cfg = config();
    const cookieResponse = response();
    setBullBoardSessionCookie(cfg, cookieResponse, 'admin-user');
    const token = (cookieResponse.cookie as jest.Mock).mock.calls[0][1] as string;
    const req = {
      headers: { cookie: `other=value; feastpot_queue_board=${token}` },
      query: {},
    } as unknown as Request;
    const res = response();
    const next = jest.fn() as NextFunction;

    bullBoardSessionAuth(cfg)(req, res, next);

    expect(res.locals.queueBoardActorId).toBe('admin-user');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired signed token', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-07T10:00:00Z'));
    const cfg = config();
    const cookieResponse = response();
    setBullBoardSessionCookie(cfg, cookieResponse, 'admin-user');
    const token = (cookieResponse.cookie as jest.Mock).mock.calls[0][1] as string;
    jest.setSystemTime(new Date('2026-09-07T10:06:00Z'));
    const req = {
      headers: { cookie: `feastpot_queue_board=${token}` },
      query: {},
    } as unknown as Request;
    const res = response();

    bullBoardSessionAuth(cfg)(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    jest.useRealTimers();
  });
});
