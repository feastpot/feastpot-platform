'use client';

import { cn } from '@feastpot/ui';
import {
  CheckCircle2,
  FolderOpen,
  ImageIcon,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import type { VendorMenu } from '@/hooks/use-menus';

interface Props {
  menus: VendorMenu[];
}

/**
 * Top stat row on the Menu screen, mirroring the Vendor6 mockup. The
 * "Missing allergens" / "Missing photos" cards are fed by the per-menu
 * `itemHealth` counts the menus payload now returns on the owner view
 * (aggregated server-side - no N+1 per-item fetch).
 */
export function MenuStatCards({ menus }: Props) {
  const total = menus.length;
  const active = menus.filter((m) => m.isActive).length;
  const totalItems = menus.reduce((acc, m) => acc + (m._count?.items ?? 0), 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const updatedThisWeek = menus.filter((m) => new Date(m.updatedAt).getTime() >= weekAgo).length;
  const missingAllergens = menus.reduce((acc, m) => acc + (m.itemHealth?.missingAllergens ?? 0), 0);
  const missingImages = menus.reduce((acc, m) => acc + (m.itemHealth?.missingImages ?? 0), 0);

  // Publishing health is a quick at-a-glance signal: green if every
  // active menu has at least one item, amber if any active menu is
  // empty, neutral if there are no menus yet.
  const emptyActive = menus.filter((m) => m.isActive && (m._count?.items ?? 0) === 0).length;
  const health = total === 0 ? 'neutral' : emptyActive === 0 ? 'good' : 'attention';

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard
        tone="teal"
        Icon={CheckCircle2}
        label="Publishing health"
        value={
          health === 'good' ? 'Good' : health === 'attention' ? 'Needs attention' : 'Set up menus'
        }
        hint={
          health === 'good'
            ? 'All active menus have items'
            : health === 'attention'
              ? `${emptyActive} active menu${emptyActive === 1 ? '' : 's'} with no items`
              : 'Add your first menu to start selling'
        }
      />
      <StatCard
        tone="amber"
        Icon={ListChecks}
        label="Total items"
        value={String(totalItems)}
        hint={total === 0 ? 'No menus yet' : `Across ${total} menu${total === 1 ? '' : 's'}`}
      />
      <StatCard
        tone="brand"
        Icon={Sparkles}
        label="Updated this week"
        value={String(updatedThisWeek)}
        hint={updatedThisWeek === 0 ? 'No changes in 7 days' : 'Keep menus fresh for repeat orders'}
      />
      <StatCard
        tone="vendor"
        Icon={FolderOpen}
        label="Active menus"
        value={`${active} / ${total}`}
        hint={total === 0 ? 'None yet' : `${total - active} inactive`}
      />
      <StatCard
        tone="teal"
        Icon={ShieldCheck}
        label="Missing allergens"
        value={String(missingAllergens)}
        hint={
          missingAllergens === 0
            ? 'All items list allergen info'
            : `Item${missingAllergens === 1 ? '' : 's'} without allergen info`
        }
      />
      <StatCard
        tone="amber"
        Icon={ImageIcon}
        label="Missing photos"
        value={String(missingImages)}
        hint={missingImages === 0 ? 'Every item has a photo' : 'Items with photos get more orders'}
      />
    </div>
  );
}

const TONES: Record<'teal' | 'amber' | 'brand' | 'vendor', { iconBg: string; iconFg: string }> = {
  teal: { iconBg: 'bg-teal-light', iconFg: 'text-teal' },
  amber: { iconBg: 'bg-amber-100', iconFg: 'text-amber-600' },
  brand: { iconBg: 'bg-brand/10', iconFg: 'text-brand' },
  vendor: { iconBg: 'bg-teal-light', iconFg: 'text-teal' },
};

function StatCard({
  tone,
  Icon,
  label,
  value,
  hint,
}: {
  tone: 'teal' | 'amber' | 'brand' | 'vendor';
  Icon: typeof CheckCircle2;
  label: string;
  value: string;
  hint: string;
}) {
  const t = TONES[tone];
  return (
    <div className="fp-card border border-border bg-white p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', t.iconBg)}
        >
          <Icon className={cn('h-5 w-5', t.iconFg)} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mid">{label}</p>
          <p className="mt-0.5 truncate text-xl font-extrabold tracking-tight text-dark">{value}</p>
          <p className="mt-0.5 truncate text-xs text-mid">{hint}</p>
        </div>
      </div>
    </div>
  );
}
