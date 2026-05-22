'use client';

import { ImageIcon, ShieldCheck, Tags } from 'lucide-react';

import type { VendorMenu } from '@/hooks/use-menus';

interface Props {
  menus: VendorMenu[];
}

/**
 * Right-rail summary used on the Menu screen. Two cards:
 *   1. Menu summary — counts derivable from the existing
 *      `/vendors/:id/menus` payload (total, active, inactive,
 *      total items, avg items/menu).
 *   2. Quick tips — static educational nudges pointing at the
 *      menu best-practices guide. Pure copy, no data.
 *
 * The mockup also shows "Out of stock items" and "Draft items"
 * rows; those would require per-item data we don't fetch on this
 * page today so they're omitted until either the menus payload
 * exposes them or there's an aggregate endpoint.
 */
export function MenuSummaryRail({ menus }: Props) {
  const total = menus.length;
  const active = menus.filter((m) => m.isActive).length;
  const inactive = total - active;
  const totalItems = menus.reduce((acc, m) => acc + (m._count?.items ?? 0), 0);
  const avgItems = total === 0 ? 0 : Math.round(totalItems / total);

  return (
    <div className="space-y-4">
      <section className="fp-card border border-border bg-white p-4">
        <h2 className="text-sm font-bold text-dark">Menu summary</h2>
        <dl className="mt-3 space-y-2.5">
          <Row label="Total menus" value={String(total)} />
          <Row label="Active menus" value={String(active)} />
          <Row label="Inactive menus" value={String(inactive)} />
          <Row label="Total items" value={String(totalItems)} />
          <Row label="Avg items / menu" value={String(avgItems)} />
        </dl>
      </section>

      <section className="fp-card border border-border bg-white p-4">
        <h2 className="text-sm font-bold text-dark">Quick tips</h2>
        <ul className="mt-3 space-y-2">
          <Tip
            Icon={ImageIcon}
            title="Add high quality images"
            body="Menus with images get more orders."
          />
          <Tip
            Icon={ShieldCheck}
            title="List allergens"
            body="Helps customers make safe choices."
          />
          <Tip Icon={Tags} title="Use tags and categories" body="Make it easier to discover dishes." />
        </ul>
        {/* The mockup includes a "Visit Menu best practices" CTA; the
            destination guide doesn't exist yet so the button is
            omitted to avoid a dead link back to /menu. Re-add it
            here once the guide route or external help URL ships. */}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-mid">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-dark">{value}</dd>
    </div>
  );
}

function Tip({ Icon, title, body }: { Icon: typeof ImageIcon; title: string; body: string }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2.5">
      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-mid">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-dark">{title}</p>
        <p className="text-[11px] text-mid">{body}</p>
      </div>
    </li>
  );
}
