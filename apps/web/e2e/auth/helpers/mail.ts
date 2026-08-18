/**
 * Test inbox helper for real end-to-end email delivery tests.
 *
 * Uses the Mailosaur REST API to poll a virtual inbox and extract
 * confirmation/reset links from received emails.
 *
 * SETUP (one-time):
 *  1. Create a free Mailosaur account at https://mailosaur.com
 *  2. Copy your API key and server ID from the dashboard
 *  3. Set TEST_MAILOSAUR_API_KEY and TEST_MAILOSAUR_SERVER_ID in your env
 *  4. Your Supabase project's custom SMTP must be configured to send via
 *     Resend/Mailosaur (see MANUAL-AUTH-TESTS.md)
 *
 * Tests that call MailHelper.skip() become no-ops when the key is absent so
 * the suite still passes in CI environments without email infrastructure.
 *
 * Mailosaur API docs: https://mailosaur.com/docs/api/
 */

import { test } from '@playwright/test';

const API_KEY = process.env.TEST_MAILOSAUR_API_KEY ?? '';
const SERVER_ID = process.env.TEST_MAILOSAUR_SERVER_ID ?? '';
const BASE_URL = 'https://mailosaur.com/api';

/** Returns a Mailosaur inbox address for the given local part. */
export function mailosaurAddress(localPart: string): string {
  return `${localPart}@${SERVER_ID}.mailosaur.net`;
}

/** Skip the current test if Mailosaur credentials are not configured. */
export function skipIfNoMailosaur() {
  if (!API_KEY || !SERVER_ID) {
    test.skip(
      true,
      'Set TEST_MAILOSAUR_API_KEY and TEST_MAILOSAUR_SERVER_ID to run real-email tests',
    );
  }
}

interface MailosaurMessage {
  id: string;
  subject: string;
  html: { body: string } | null;
  text: { body: string } | null;
}

interface MailosaurListResponse {
  items: Array<{ id: string }>;
}

async function mailosaurFetch(path: string, init?: RequestInit): Promise<Response> {
  const credentials = Buffer.from(`${API_KEY}:`).toString('base64');
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Poll the Mailosaur inbox until a message arrives for the given address.
 * Throws if no message arrives within the timeout.
 *
 * @param to       Full inbox address (from mailosaurAddress())
 * @param timeout  Max wait time in milliseconds (default 60 s)
 */
export async function waitForEmail(to: string, timeout = 60_000): Promise<MailosaurMessage> {
  const sentAfter = new Date(Date.now() - 5_000).toISOString();
  const params = new URLSearchParams({
    server: SERVER_ID,
    sentTo: to,
    sentAfter,
    timeout: String(timeout),
  });

  // Mailosaur's /messages/await endpoint blocks until a matching message arrives.
  const res = await mailosaurFetch(`/messages/await?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailosaur await failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<MailosaurMessage>;
}

/**
 * Delete all messages in the server inbox. Call in afterEach / afterAll
 * to keep the inbox clean between test runs.
 */
export async function purgeInbox(): Promise<void> {
  await mailosaurFetch(`/messages?server=${SERVER_ID}`, { method: 'DELETE' });
}

/**
 * Extract the first href that matches the pattern from an email body.
 * Looks in the HTML body first, then falls back to the text body.
 */
export function extractLink(message: MailosaurMessage, pattern: RegExp): string {
  const haystack = message.html?.body ?? message.text?.body ?? '';

  // Try href="..." first (HTML email).
  const hrefMatch = haystack.match(new RegExp(`href=["']([^"']*${pattern.source}[^"']*)["']`, 'i'));
  if (hrefMatch?.[1]) return hrefMatch[1];

  // Fall back to a bare URL in plain-text.
  const urlMatch = haystack.match(new RegExp(`https?://\\S*${pattern.source}\\S*`, 'i'));
  if (urlMatch?.[0]) return urlMatch[0];

  throw new Error(
    `No link matching ${pattern} found in email: ${JSON.stringify(message).slice(0, 200)}`,
  );
}

/**
 * Get the confirmation link from a signup/magic-link/invite email.
 * For our scanner-proof templates the link goes to /auth/confirm with
 * the token_hash in the fragment.
 */
export function extractConfirmLink(message: MailosaurMessage): string {
  return extractLink(message, /\/auth\/confirm/);
}

/**
 * Get the password-reset link from a recovery email.
 * The recovery template uses ConfirmationURL which goes to /auth/callback?type=recovery.
 */
export function extractResetLink(message: MailosaurMessage): string {
  return extractLink(message, /\/auth\/(callback|reset)/);
}
