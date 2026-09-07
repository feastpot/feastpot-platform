import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ADMIN_ROUTE_EXCLUSIONS,
  ADMIN_DESTINATION_ROLES,
  STAFF_ROLES,
  USER_GUIDE_DEEP_LINKS,
} from '../src/lib/admin-destinations';
import { NAV_GROUPS } from '../src/components/layout/admin-shell';

test('canonical destination map covers every NAV_GROUPS destination', () => {
  const navigationDestinations = NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => item.href),
  );
  expect(Object.keys(ADMIN_DESTINATION_ROLES).sort()).toEqual(
    expect.arrayContaining([...new Set(navigationDestinations)].sort()),
  );
  for (const item of NAV_GROUPS.flatMap((group) => group.items)) {
    expect(ADMIN_DESTINATION_ROLES[item.href as keyof typeof ADMIN_DESTINATION_ROLES]).toEqual(
      item.roles ?? STAFF_ROLES,
    );
  }
});

test('canonical destination map covers every documented User guide anchor', () => {
  const guide = readFileSync(path.join(__dirname, '../src/app/user-guide/page.tsx'), 'utf8');
  const documented = [...guide.matchAll(/id: '([^']+)'/g)].map((match) => `#${match[1]}`);
  expect([...USER_GUIDE_DEEP_LINKS].sort()).toEqual(documented.sort());
});

function filesystemPageRoutes(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const route = `${prefix}/${entry.name}`;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesystemPageRoutes(fullPath, route);
    if (entry.name !== 'page.tsx') return [];
    const pathname = prefix || '/';
    // Inventory patterns use descriptive factory parameter names rather than
    // Next's implementation parameter names. The check only needs to prove a
    // dynamic filesystem route has a corresponding pattern.
    return [pathname.replace(/\[[^\]]+\]/g, ':')];
  });
}

test('canonical destination map accounts for every admin filesystem page', () => {
  const appDirectory = path.join(__dirname, '../src/app');
  const routes = filesystemPageRoutes(appDirectory);
  const inventory = Object.keys(ADMIN_DESTINATION_ROLES).map((route) =>
    route.replace(/:[^/?]+/g, ':').replace(/\?.*$/, ''),
  );
  const exclusions = Object.keys(ADMIN_ROUTE_EXCLUSIONS);

  for (const route of routes) {
    expect(
      inventory.includes(route) || exclusions.includes(route),
      `${route} must be represented in ADMIN_DESTINATION_ROLES or explicitly excluded`,
    ).toBe(true);
  }
});
