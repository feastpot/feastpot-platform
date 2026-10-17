import { expect, test } from '@playwright/test';

import { abandonThreeDs } from './three-ds';

test('3DS abandonment cancels the SDK dialog, not the ACS failure or a business button', async ({
  page,
}) => {
  await page.route('https://js.stripe.com/v3/challenge-iframe-test.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<button onclick="if(confirm('Cancel authentication?')) parent.postMessage('cancelled', '*')">Close</button>
        <button id="test-source-fail-3ds" onclick="parent.postMessage('failed', '*')">Fail authentication</button>`,
    }),
  );
  await page.setContent(`<main><button onclick="document.body.dataset.outcome='business'">Cancel</button></main>
    <iframe src="https://js.stripe.com/v3/challenge-iframe-test.html"></iframe>
    <script>addEventListener('message', event => document.body.dataset.outcome = event.data)</script>`);
  await abandonThreeDs(page);
  await expect(page.locator('body')).toHaveAttribute('data-outcome', 'cancelled');
});
