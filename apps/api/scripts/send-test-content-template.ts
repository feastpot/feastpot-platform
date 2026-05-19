/* eslint-disable no-console */
/**
 * Live test: instantiate WhatsappProvider standalone (no Nest DI) and
 * send a real Twilio Content Template by internal event name. Reads
 * TWILIO_CONTENT_SID_<template> from env, exactly like production.
 *
 *   npx tsx scripts/send-test-content-template.ts +447704715723 order_confirmation
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { WhatsappProvider } from '../src/modules/notifications/providers/whatsapp.provider';

async function main() {
  const to = process.argv[2];
  const template = process.argv[3] ?? 'order_confirmation';
  const paramsArg = process.argv[4];
  if (!to) {
    console.error('Usage: tsx scripts/send-test-content-template.ts <+E164> [templateName] [paramsJson]');
    process.exit(1);
  }

  const config = new ConfigService(process.env);
  const wa = new WhatsappProvider(config);

  const params: Array<string | number> = paramsArg
    ? (JSON.parse(paramsArg) as Array<string | number>)
    : ['Sarah', 'FP-2026-00042', '£24.50'];
  console.log(`Sending template=${template} to=${to} params=${JSON.stringify(params)}`);
  const r = await wa.send({ to, template, params });
  console.log('Result:', r);
}

main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
