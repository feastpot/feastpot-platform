import { expect, type Dialog, type Locator, type Page } from '@playwright/test';

async function authenticationCancel(page: Page): Promise<Locator | undefined> {
  const matches: Locator[] = [];
  for (const frame of page.frames()) {
    if (!URL.canParse(frame.url())) continue;
    const url = new URL(frame.url());
    if (
      url.protocol !== 'https:' ||
      !['js.stripe.com', 'hooks.stripe.com'].includes(url.hostname)
    ) {
      continue;
    }
    const button = frame.getByRole('button', {
      name: /^(close|cancel)(?: authentication| challenge)?$/i,
    });
    if ((await button.count()) === 1 && (await button.isVisible())) matches.push(button);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

export async function abandonThreeDs(page: Page): Promise<void> {
  // Failing the ACS challenge is not abandonment: it can leave Stripe's
  // authentication modal open. Cancel the SDK-owned authentication instead.
  // Wait for the ACS to initialise, not merely for the outer loading dialog's
  // Cancel button. Cancelling before the challenge mounts can strand the SDK.
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          for (const id of ['#test-source-authorize-3ds', '#test-source-fail-3ds']) {
            if (
              await frame
                .locator(id)
                .isVisible()
                .catch(() => false)
            )
              return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect
    .poll(async () => !!(await authenticationCancel(page)), { timeout: 30_000 })
    .toBe(true);
  const cancel = await authenticationCancel(page);
  if (!cancel) throw new Error('CUSTOMER_E2E_3DS_CANCEL_NOT_FOUND');
  const confirmCancellation = async (dialog: Dialog) => {
    if (dialog.type() === 'confirm' && /cancel|authentication/i.test(dialog.message())) {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  };
  page.once('dialog', confirmCancellation);
  try {
    await cancel.click();
  } finally {
    page.removeListener('dialog', confirmCancellation);
  }
}
