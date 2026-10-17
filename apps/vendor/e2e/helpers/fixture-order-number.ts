import { randomUUID } from 'node:crypto';

/** Keep readable test identifiers within Order.orderNumber's varchar(32). */
export function fixtureOrderNumber(label: string): string {
  return `TF-${label.slice(0, 6)}-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}
