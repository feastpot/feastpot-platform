import { Resend } from 'resend';

import { TEMPLATES } from '../src/modules/notifications/templates';

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('usage: tsx send-test-vendor-email.ts <recipient>');
    process.exit(1);
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'Feastpot <noreply@feastpot.co.uk>';
  if (!apiKey) {
    console.error('RESEND_API_KEY not set');
    process.exit(1);
  }

  const tpl = TEMPLATES['vendor_approved'];
  const data = {
    vendorFirstName: 'Soul',
    businessName: 'Test Kitchen',
    portalUrl: `${process.env.VENDOR_PORTAL_URL ?? 'https://vendor.feastpot.co.uk'}/onboarding`,
    supportEmail: 'hello@feastpot.co.uk',
  };

  const subject = tpl.subject(data);
  const html = tpl.render(data);

  console.log(`Sending "${subject}"`);
  console.log(`  from: ${from}`);
  console.log(`  to:   ${to}`);

  const resend = new Resend(apiKey);
  const { data: resp, error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    console.error('Resend error:', error);
    process.exit(2);
  }
  console.log('Sent. id =', resp?.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(3);
});
