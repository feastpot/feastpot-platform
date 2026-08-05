import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailProvider } from '../notifications/providers/email.provider';

import { WaitlistService } from './waitlist.service';

function makeCreate(err?: Error) {
  return jest
    .fn()
    .mockImplementation(() => (err ? Promise.reject(err) : Promise.resolve({ id: 'wl-1' })));
}
function makeEmail() {
  return { send: jest.fn().mockResolvedValue({ id: 'e-1', delivered: true }) };
}
function makeConfig(key: string) {
  return { get: jest.fn().mockReturnValue(key) } as unknown as ConfigService;
}

function makeService(createImpl?: jest.Mock, emailMock?: ReturnType<typeof makeEmail>) {
  const prismaMock = {
    postcodeWaitlist: { create: createImpl ?? makeCreate() },
  } as unknown as PrismaService;
  const emailProvider = (emailMock ?? makeEmail()) as unknown as EmailProvider;
  const config = makeConfig('test@feastpot.co.uk');
  return {
    service: new WaitlistService(prismaMock, emailProvider, config),
    prismaMock,
    emailProvider,
  };
}

describe('WaitlistService', () => {
  describe('register', () => {
    it('returns ok:true and saves a valid signup', async () => {
      const { service, prismaMock } = makeService();
      const result = await service.register({
        email: 'grace@example.com',
        postcode: 'SE15 4EE',
        source: 'homepage',
      });
      expect(result).toEqual({ ok: true });
      expect(prismaMock.postcodeWaitlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'grace@example.com',
            postcode: 'SE15 4EE',
            outwardCode: 'SE15',
            source: 'homepage',
          }),
        }),
      );
    });

    it('returns ok:true without saving when honeypot is filled', async () => {
      const { service, prismaMock } = makeService();
      const result = await service.register({
        email: 'bot@spam.io',
        postcode: 'SE15 4EE',
        source: 'homepage',
        website: 'http://spam.io',
      });
      expect(result).toEqual({ ok: true });
      expect(prismaMock.postcodeWaitlist.create).not.toHaveBeenCalled();
    });

    it('returns ok:true (not error) on duplicate email+outwardCode', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      const { service } = makeService(makeCreate(p2002));
      const result = await service.register({
        email: 'grace@example.com',
        postcode: 'SE15 4EE',
        source: 'homepage',
      });
      expect(result).toEqual({ ok: true });
    });

    it('re-throws non-duplicate database errors', async () => {
      const dbErr = new Error('connection refused');
      const { service } = makeService(makeCreate(dbErr));
      await expect(
        service.register({ email: 'x@x.com', postcode: 'SE15 4EE', source: 'homepage' }),
      ).rejects.toThrow('connection refused');
    });

    it('normalises the postcode before saving', async () => {
      const { service, prismaMock } = makeService();
      await service.register({ email: 'a@b.com', postcode: 'se154ee', source: 'homepage' });
      expect(prismaMock.postcodeWaitlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ postcode: 'SE15 4EE', outwardCode: 'SE15' }),
        }),
      );
    });

    it('does not fail when confirmation email throws', async () => {
      const emailMock = { send: jest.fn().mockRejectedValue(new Error('Resend down')) };
      const { service } = makeService(
        undefined,
        emailMock as unknown as ReturnType<typeof makeEmail>,
      );
      await expect(
        service.register({ email: 'a@b.com', postcode: 'SE15 4EE', source: 'homepage' }),
      ).resolves.toEqual({ ok: true });
    });
  });
});
