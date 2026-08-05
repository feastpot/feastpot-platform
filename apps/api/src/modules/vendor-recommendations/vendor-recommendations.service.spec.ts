import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailProvider } from '../notifications/providers/email.provider';

import { VendorRecommendationsService } from './vendor-recommendations.service';

function makeCreate() {
  return jest.fn().mockResolvedValue({ id: 'vr-1' });
}
function makeEmail() {
  return { send: jest.fn().mockResolvedValue({ id: 'e-1', delivered: true }) };
}
function makeService(createImpl?: jest.Mock, emailMock?: ReturnType<typeof makeEmail>) {
  const prismaMock = {
    vendorRecommendation: { create: createImpl ?? makeCreate() },
  } as unknown as PrismaService;
  const emailProvider = (emailMock ?? makeEmail()) as unknown as EmailProvider;
  const config = {
    get: jest.fn().mockReturnValue('admin@feastpot.co.uk'),
  } as unknown as ConfigService;
  return {
    service: new VendorRecommendationsService(prismaMock, emailProvider, config),
    prismaMock,
  };
}

describe('VendorRecommendationsService', () => {
  describe('create', () => {
    it('saves when businessName is provided', async () => {
      const { service, prismaMock } = makeService();
      const result = await service.create({ businessName: "Mama's Kitchen" });
      expect(result).toEqual({ ok: true });
      expect(prismaMock.vendorRecommendation.create).toHaveBeenCalled();
    });

    it('saves when only instagramHandle is provided', async () => {
      const { service, prismaMock } = makeService();
      await service.create({ instagramHandle: 'mamasfood_ldn' });
      expect(prismaMock.vendorRecommendation.create).toHaveBeenCalled();
    });

    it('saves when only phone is provided', async () => {
      const { service, prismaMock } = makeService();
      await service.create({ phone: '+447700900000' });
      expect(prismaMock.vendorRecommendation.create).toHaveBeenCalled();
    });

    it('throws BadRequest when none of the three identifier fields are present', async () => {
      const { service } = makeService();
      await expect(service.create({ recommendedByEmail: 'x@x.com' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns ok:true without saving when honeypot is filled', async () => {
      const { service, prismaMock } = makeService();
      const result = await service.create({ businessName: 'Bot', website: 'http://spam.io' });
      expect(result).toEqual({ ok: true });
      expect(prismaMock.vendorRecommendation.create).not.toHaveBeenCalled();
    });

    it('does not fail when internal alert email throws', async () => {
      const emailMock = { send: jest.fn().mockRejectedValue(new Error('Resend down')) };
      const { service } = makeService(
        undefined,
        emailMock as unknown as ReturnType<typeof makeEmail>,
      );
      await expect(service.create({ businessName: 'Test Kitchen' })).resolves.toEqual({ ok: true });
    });
  });
});
