import twilio from 'twilio';

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('usage: tsx send-test-whatsapp.ts <recipient-e164>');
    process.exit(1);
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromRaw = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !fromRaw) {
    console.error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM not all set');
    process.exit(1);
  }

  const body =
    'Feastpot test: if you see this, the Twilio WhatsApp Sandbox is wired correctly. Reply STOP to opt out.';
  const fromAddr = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;
  const toAddr = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  console.log(`Sending WhatsApp`);
  console.log(`  from: ${fromAddr}`);
  console.log(`  to:   ${toAddr}`);

  const client = twilio(sid, token);
  const msg = await client.messages.create({ from: fromAddr, to: toAddr, body });
  console.log('Sent. sid =', msg.sid, 'status =', msg.status);
}

main().catch((e) => {
  console.error('Twilio error:', e?.message ?? e);
  if (e?.code) console.error('code:', e.code, 'moreInfo:', e.moreInfo);
  process.exit(2);
});
