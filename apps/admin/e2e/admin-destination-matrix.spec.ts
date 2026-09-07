import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  ADMIN_DESTINATION_MATRIX,
  STAFF_ROLES,
  type StaffRole,
} from '../src/lib/admin-destinations';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';
const stateFile = (role: StaffRole) => path.join(__dirname, `.auth/${role}.json`);

async function authenticatedPage(browser: import('@playwright/test').Browser, role: StaffRole) {
  const context = await browser.newContext({ storageState: stateFile(role) });
  return { context, page: await context.newPage() };
}

for (const role of ['customer', 'vendor'] as const) {
  for (const destination of ADMIN_DESTINATION_MATRIX) {
    test(`${role} is denied ${destination.pathname} without an admin shell`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        storageState: path.join(__dirname, `.auth/${role}.json`),
      });
      const page = await context.newPage();
      try {
        await page.goto(`${BASE}${destination.pathname}`);
        await expect(page).toHaveURL(/\/unauthorized(?:\?|$)/);
        await expect(page.locator('aside[aria-label="Admin console navigation"]')).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }
}

for (const destination of ADMIN_DESTINATION_MATRIX) {
  const allowedRoles: readonly StaffRole[] = destination.allowedRoles;
  for (const role of STAFF_ROLES.filter((candidate) => !allowedRoles.includes(candidate))) {
    test(`${role} is denied ${destination.pathname}`, async ({ browser }) => {
      const { context, page } = await authenticatedPage(browser, role);
      try {
        await page.goto(`${BASE}${destination.pathname}`);
        await expect(page).toHaveURL(/\/unauthorized(?:\?|$)/);
        await expect(page.locator('aside[aria-label="Admin console navigation"]')).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }

  for (const role of allowedRoles) {
    for (const renderState of ['empty', 'populated', 'api-error'] as const) {
      test(`${role} loads ${destination.pathname} with ${renderState} state`, async ({
        browser,
      }) => {
        const { context, page } = await authenticatedPage(browser, role);
        try {
          // Authentication/session endpoints are deliberately never routed.
          // Do not add a catch-all /v1 route here: server-rendered pages rely on
          // real auth and each destination needs an endpoint-specific fixture.
          // This is the shell's destination data endpoint, not an auth/session
          // endpoint. Its contract is deliberately complete for every state.
          await page.route(/\/v1\/admin\/work-queue(?:\?.*)?$/, (route) => {
            if (renderState === 'api-error') {
              return route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Matrix API outage. Retry the request.' }),
              });
            }
            return route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify(
                renderState === 'empty'
                  ? { observedAt: '2025-01-01T00:00:00.000Z', items: [], counts: {} }
                  : {
                      observedAt: '2025-01-01T00:00:00.000Z',
                      items: [
                        {
                          id: 'matrix-populated-work-item',
                          type: 'matrix',
                          title: 'Matrix populated work item',
                          href: '/queues',
                          severity: 'low',
                        },
                      ],
                      counts: { jobs: 1 },
                    },
              ),
            });
          });
          await page.goto(`${BASE}${destination.pathname}`);
          await expect(page).not.toHaveURL(/\/(sign-in|unauthorized)(?:\?|$)/);
          await expect(page.locator('main')).toBeVisible();
          await expect(page.locator('aside[aria-label="Admin console navigation"]')).toBeVisible();
          await expect(page.locator('nextjs-portal')).toHaveCount(0);
          // Every successful render must retain a semantic main landmark. Error
          // views additionally need a user-actionable alert/status, rather than
          // an error boundary or a blank client crash.
          if (renderState === 'api-error') {
            await expect(
              page.getByRole('alert').filter({ hasText: /operational queue could not be loaded/i }),
            ).toBeVisible({ timeout: 10_000 });
            await expect(
              page.getByRole('button', { name: /retry operational queue/i }),
            ).toBeVisible();
          } else if (renderState === 'empty') {
            await expect(
              page.getByRole('status', { name: /0 operational work items/i }),
            ).toBeVisible();
          } else {
            await expect(
              page.getByRole('status', { name: /1 operational work items/i }),
            ).toBeVisible();
            await expect(
              page.getByRole('status', { name: /matrix populated work item/i }),
            ).toBeVisible();
          }
        } finally {
          await context.close();
        }
      });
    }
  }
}
