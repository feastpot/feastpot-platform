import { EmailProvider } from './email.provider';

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

describe('email acceptance evidence', () => {
  const config = {
    get: (key: string) =>
      ({
        RESEND_API_KEY: 'fixture-key',
        EMAIL_FROM: 'Fixture <fixture@example.test>',
      })[key as 'RESEND_API_KEY' | 'EMAIL_FROM'],
  };
  const message = {
    to: 'controlled-fixture@example.test',
    subject: 'Fixture',
    html: '<p>Fixture</p>',
  };

  beforeEach(() => mockSend.mockReset());

  it('returns the acceptance ID from the adapter response', async () => {
    mockSend.mockResolvedValue({ data: { id: 'provider-fixture-id' }, error: null });
    expect(await new EmailProvider(config as never).send(message)).toEqual({
      id: 'provider-fixture-id',
      delivered: true,
    });
  });

  it('fails explicitly rather than claiming delivery without an acceptance ID', async () => {
    mockSend.mockResolvedValue({ data: null, error: null });
    await expect(new EmailProvider(config as never).send(message)).rejects.toThrow(
      'missing a provider message ID',
    );
  });

  it('does not claim acceptance after a provider rejection', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'Fixture rejection' } });
    await expect(new EmailProvider(config as never).send(message)).rejects.toThrow(
      'Resend error: Fixture rejection',
    );
  });
});
