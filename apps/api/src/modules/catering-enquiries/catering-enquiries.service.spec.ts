import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailProvider } from '../notifications/providers/email.provider';
import type { WhatsappProvider } from '../notifications/providers/whatsapp.provider';

import { CateringEnquiriesService } from './catering-enquiries.service';

function makeCreate() {
  return jest.fn().mockResolvedValue({
    id: 'ce-1',
    postcode: 'SE15 4EE',
    outwardCode: 'SE15',
    occasionType: 'birthday-party',
  });
}
function makeEmail() {
  return { send: jest.fn().mockResolvedValue({ id: 'e-1', delivered: true }) };
}
function makeWhatsapp() {
  return { send: jest.fn().mockResolvedValue({ id: null, delivered: false }) };
}
function makeService(
  createImpl?: jest.Mock,
  emailMock?: ReturnType<typeof makeEmail>,
  whatsappMock?: ReturnType<typeof makeWhatsapp>,
  configGet?: jest.Mock,
) {
  const prismaMock = {
    cateringEnquiry: { create: createImpl ?? makeCreate() },
  } as unknown as PrismaService;
  const emailProvider = (emailMock ?? makeEmail()) as unknown as EmailProvider;
  const whatsappProvider = (whatsappMock ?? makeWhatsapp()) as unknown as WhatsappProvider;
  const config = {
    get: configGet ?? jest.fn().mockReturnValue('admin@feastpot.co.uk'),
  } as unknown as ConfigService;
  return {
    service: new CateringEnquiriesService(prismaMock, emailProvider, whatsappProvider, config),
    prismaMock,
    emailProvider,
    whatsappProvider,
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

    it('sends WhatsApp alert when CATERING_ALERT_WHATSAPP_TO and Content SID are configured', async () => {
      const whatsappMock = makeWhatsapp();
      const configGet = jest.fn().mockImplementation((key: string) => {
        if (key === 'CATERING_ALERT_WHATSAPP_TO') return '+447700900001';
        if (key === 'TWILIO_CONTENT_SID_catering_enquiry_alert') return 'HX_test_sid';
        return 'admin@feastpot.co.uk';
      });
      const { service } = makeService(undefined, undefined, whatsappMock, configGet);
      await service.create(VALID_DTO);
      // Give the fire-and-forget promise a tick to settle
      await new Promise((r) => setTimeout(r, 0));
      expect(whatsappMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+447700900001',
          template: 'catering_enquiry_alert',
          params: ['Grace Okafor', 'birthday-party'],
        }),
      );
    });

    it('skips WhatsApp alert when CATERING_ALERT_WHATSAPP_TO is not set', async () => {
      const whatsappMock = makeWhatsapp();
      const configGet = jest.fn().mockReturnValue(undefined); // no env vars set
      const { service } = makeService(undefined, undefined, whatsappMock, configGet);
      await service.create(VALID_DTO);
      await new Promise((r) => setTimeout(r, 0));
      expect(whatsappMock.send).not.toHaveBeenCalled();
    });
  });
});
