/**
 * Playwright auth setup project.
 *
 * Signs in with the test vendor account and persists the Supabase session
 * (cookies + localStorage) to e2e/.auth/vendor.json so subsequent test
 * projects can load it via storageState without repeating sign-in.
 *
 * Prerequisites:
 *   TEST_VENDOR_EMAIL and TEST_VENDOR_PASSWORD must be set.
 *   The account must belong to a vendor in `live` or `probation` status
 *   so the middleware lets it through to /menu.
 *
 * If the env vars are absent the file is written as empty JSON and a
 * warning is printed. Tests that require auth will see redirect-to-
 *  /sign-in and fail immediately rather than silently producing false
 * passes.
 */
import * as fs from 'fs';
import * as path from 'path';

import { expect, test as setup, type Response } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const STATE_PATH = path.join(__dirname, '.auth', 'vendor.json');

function safeProfileResponseBody(body: string): string {
  const maxLength = 2_000;
  try {
    const redact = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(redact);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          /password|secret|token|authorization|cookie|email|phone|address|bank/i.test(key)
            ? '[REDACTED]'
            : redact(child),
        ]),
      );
    };
    return JSON.stringify(redact(JSON.parse(body))).slice(0, maxLength);
  } catch {
    return body
      .slice(0, maxLength)
      .replace(/(bearer\s+|token[=:]\s*|password[=:]\s*)[^\s,"]+/gi, '$1[REDACTED]');
  }
}

async function profileDiagnostic(response: Response | null): Promise<string> {
  if (!response) return 'Profile API: no /v1/vendors/me response was observed.';
  const origin = new URL(response.url()).origin;
  if (response.ok()) {
    return `Profile API: ${response.status()} from ${origin} (successful response body omitted).`;
  }
  const body = safeProfileResponseBody(await response.text().catch(() => 'Unable to read body.'));
  return `Profile API: ${response.status()} from ${origin}; response body: ${body}`;
}

async function resetCiVendorPassword(email: string, password: string): Promise<void> {
  if (!process.env.CI) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'auth setup: CI password reset requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const perPage = 1000;
  let authUserId: string | undefined;
  for (let page = 1; !authUserId; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth setup: Supabase user lookup failed: ${error.message}`);
    authUserId = data.users.find((user) => user.email === email)?.id;
    if (data.users.length < perPage) break;
  }
  if (!authUserId) {
    throw new Error('auth setup: the configured vendor has no matching Supabase Auth user.');
  }

  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    password,
    email_confirm: true,
    app_metadata: { role: 'vendor' },
    user_metadata: { role: 'vendor', e2e: true },
  });
  if (error) throw new Error(`auth setup: Supabase password reset failed: ${error.message}`);
}

async function verifyCiVendorPassword(email: string, password: string): Promise<void> {
  if (!process.env.CI) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'auth setup: CI auth preflight requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(
      `auth setup: Supabase password preflight failed before browser sign-in: ` +
        `${error?.message ?? 'no session returned'}${error?.status ? ` (status ${error.status})` : ''}.`,
    );
  }
  await client.auth.signOut();
}

setup('authenticate as test vendor', async ({ page }) => {
  const email = process.env.TEST_VENDOR_EMAIL;
  const password = process.env.TEST_VENDOR_PASSWORD;

  // Reject obvious placeholders so the error surfaces before the browser opens.
  const PLACEHOLDERS = new Set([
    '...',
    'real@address.com',
    'you@example.com',
    'yourpassword',
    'realpassword',
  ]);
  if (!email || !password || PLACEHOLDERS.has(email) || PLACEHOLDERS.has(password)) {
    throw new Error(
      'auth setup: TEST_VENDOR_EMAIL and TEST_VENDOR_PASSWORD must be set to real\n' +
        'Supabase credentials for a vendor account with status live or probation.\n\n' +
        'Example (substitute your actual values):\n' +
        '  TEST_VENDOR_EMAIL=kwame@example.com \\\n' +
        '  TEST_VENDOR_PASSWORD=hunter2 \\\n' +
        '  npm run test:e2e --workspace=@feastpot/vendor\n\n' +
        `Got: email="${email ?? '(unset)'}", password="${password ? '(set but is a placeholder)' : '(unset)'}".`,
    );
  }

  await resetCiVendorPassword(email, password);
  await verifyCiVendorPassword(email, password);

  // Always authenticate the credentials supplied for this run. Reusing a
  // storage-state file by age alone can silently select a different or already
  // torn-down factory identity.

  await page.goto('/sign-in');

  // The sign-in form has two anti-autofill measures:
  //   1. A hidden honeypot password input (name="fakepasswordremembered") that
  //      causes input[type="password"] to resolve to 2 elements, triggering
  //      Playwright strict-mode violations.
  //   2. readonly="true" on the real inputs until a user interaction fires.
  //
  // Target the real fields by their stable IDs (#email, #password). Focus each
  // field and wait for React's onFocus handler to remove readonly; mutating the
  // attribute directly can let Playwright submit before hydration has attached
  // the form handler.
  const emailInput = page.locator('#email');
  const passwordInput = page.locator('#password');

  await emailInput.waitFor({ state: 'visible' });
  await emailInput.click();
  await expect(emailInput).toBeEditable();
  await emailInput.fill(email);

  await passwordInput.waitFor({ state: 'visible' });
  await passwordInput.click();
  await expect(passwordInput).toBeEditable();
  await passwordInput.fill(password);

  const profileResponse = page
    .waitForResponse((response) => new URL(response.url()).pathname === '/v1/vendors/me', {
      timeout: 15_000,
    })
    .catch(() => null);
  await page.locator('button[type="submit"]').click();

  // Wait for the portal to settle on an authenticated route.
  // Newly-approved vendors land on /onboarding; live vendors land on /.
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
      timeout: 15_000,
    });
  } catch {
    // Capture whatever error the sign-in page is showing so the developer
    // knows immediately whether this is wrong credentials, an unverified
    // account, rate-limiting, etc.
    const pageError = await page
      .locator('[role="alert"], [data-sonner-toast], .text-red-600, .text-destructive')
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => null);
    const profile = await profileDiagnostic(await profileResponse);

    throw new Error(
      `auth setup: sign-in did not redirect away from /sign-in within 15 s.\n` +
        `Current URL: ${page.url()}\n` +
        `${profile}\n` +
        (pageError ? `Page shows: "${pageError.trim()}"\n\n` : '\n') +
        `Likely causes:\n` +
        `  - Wrong email or password for the test vendor account\n` +
        `  - The account does not exist in this Supabase project\n` +
        `  - The vendor status is not 'live' or 'probation' (middleware blocks other statuses)\n` +
        `  - Supabase rate-limiting (wait 60 s and retry)\n`,
    );
  }

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STATE_PATH });
});
