import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  const email = process.env.TEST_VENDOR_EMAIL;
  const password = process.env.TEST_VENDOR_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'TEST_VENDOR_EMAIL and TEST_VENDOR_PASSWORD are required for this regression test.',
    );
  }

  await page.goto('/sign-in');
  const emailInput = page.locator('#email');
  const passwordInput = page.locator('#password');
  await emailInput.click();
  await expect(emailInput).toBeEditable();
  await emailInput.fill(email);
  await passwordInput.click();
  await expect(passwordInput).toBeEditable();
  await passwordInput.fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('vendor metadata without a platform profile shows an application recovery message', async ({
  page,
}) => {
  // Sign-in's client-side profile check is the guard for this otherwise
  // stranded Auth state. A 404 is the API contract for no platform profile.
  await page.route('**/v1/vendors/me', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"message":"Not found"}',
    }),
  );

  await signIn(page);

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('This account is not registered as a vendor. Apply here.');
  await expect(alert.getByRole('link', { name: 'Apply here.' })).toHaveAttribute(
    'href',
    '/onboarding/register',
  );
});

test.describe('direct authenticated navigation', () => {
  test.use({ storageState: 'e2e/.auth/vendor.json' });

  test('missing-profile recovery destination stays explanatory for a direct session visit', async ({
    page,
  }) => {
    await page.goto('/not-registered');

    await expect(
      page.getByText('This account is not registered as a vendor. Apply here.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Apply here.' })).toHaveAttribute(
      'href',
      '/onboarding/register',
    );
  });
});
