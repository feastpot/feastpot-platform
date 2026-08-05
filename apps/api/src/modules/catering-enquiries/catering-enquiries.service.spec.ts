import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailProvider } from '../notifications/providers/email.provider';

import { CateringEnquiriesService } from './catering-enquiries.service';

function makeCreate() {
  return jest.fn().mockResolvedValue({ id: 'ce-1', postcode: 'SE15 4EE', outwardCode: 'SE15' });
}
function makeEmail() {
  return { send: jest.fn().mockResolvedValue({ id: 'e-1', delivered: true }) };
}
function makeService(createImpl?: jest.Mock, emailMock?: ReturnType<typeof makeEmail>) {
  const prismaMock = {
    cateringEnquiry: { create: createImpl ?? makeCreate() },
  } as unknown as PrismaService;
  const emailProvider = (emailMock ?? makeEmail()) as unknown as EmailProvider;
  const config = {
    get: jest.fn().mockReturnValue('admin@feastpot.co.uk'),
  } as unknown as ConfigService;
  return {
    service: new CateringEnquiriesService(prismaMock, emailProvider, config),
    prismaMock,
    emailProvider,
  };
}

const VALID_DTO = {
  occasionType: 'birthday-party',
  guestCountBand: '11-25' as const,
  postcode: 'SE15 4EE',
  contactName: 'Grace Okafor',
  email: 'grace@example.com',
};

describe('CateringEnquiriesService', () => {
  describe('create', () => {
    it('persists the enquiry and returns ok:true', async () => {
      const { service, prismaMock } = makeService();
      const result = await service.create(VALID_DTO);
      expect(result).toEqual({ ok: true });
      expect(prismaMock.cateringEnquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'grace@example.com',
            postcode: 'SE15 4EE',
            outwardCode: 'SE15',
            status: 'NEW',
          }),
        }),
      );
    });

    it('returns ok:true without saving when honeypot is filled', async () => {
      const { service, prismaMock } = makeService();
      const result = await service.create({ ...VALID_DTO, website: 'http://bot.io' });
      expect(result).toEqual({ ok: true });
      expect(prismaMock.cateringEnquiry.create).not.toHaveBeenCalled();
    });

    it('sends both internal alert and customer confirmation emails', async () => {
      const emailMock = makeEmail();
      const { service } = makeService(undefined, emailMock);
      await service.create(VALID_DTO);
      expect(emailMock.send).toHaveBeenCalledTimes(2);
    });

    it('does not fail when notification emails throw', async () => {
      const emailMock = { send: jest.fn().mockRejectedValue(new Error('Resend down')) };
      const { service } = makeService(
        undefined,
        emailMock as unknown as ReturnType<typeof makeEmail>,
      );
      await expect(service.create(VALID_DTO)).resolves.toEqual({ ok: true });
    });
  });
});
