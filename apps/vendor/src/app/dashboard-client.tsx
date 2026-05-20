'use client';

import { ComplianceAlerts } from '@/components/dashboard/compliance-alerts';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { StatCard } from '@/components/dashboard/stat-card';
import { useVendorStats } from '@/hooks/use-vendor-stats';

interface Props {
  /** Vendor id, used by widgets that fetch vendor-scoped data (e.g. docs). */
  vendorId: string;
  /** Friendly greeting name, usually the first word of businessName. */
  greetingName: string;
  businessName: string;
  /** Average rating from /vendors/me, null if the API didn't return one. */
  rating: number | null;
}

/**
 * Dashboard home body. Reads stats live from `/vendors/me/stats` (already
 * polled at 60s by the hook + invalidated by the realtime channel on the
 * orders page). The rating + business identity come down from the server
 * gate so the first paint always has a name + greeting without flashing
 * placeholder strings.
 */
export function DashboardClient({ vendorId, greetingName, businessName, rating }: Props) {
  const { data: stats, isLoading } = useVendorStats();
  const greeting = greetingFor(new Date());

  const todayRevenuePounds = stats ? stats.today.revenuePence / 100 : 0;
  const todayOrders = stats?.today.orders ?? 0;
  const pending = stats?.pendingNow ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight text-dark">
          {greeting}, {greetingName} <span aria-hidden>👋</span>
        </h1>
        <p className="text-sm text-mid">
          Here&rsquo;s how {businessName} is doing today.
        </p>
      </header>

      <section
        aria-label="Today at a glance"
        className="grid grid-cols-2 gap-3"
      >
        <StatCard
          icon="💰"
          label="Today's revenue"
          value={todayRevenuePounds}
          prefix="£"
          color="brand"
        />
        <StatCard
          icon="📦"
          label="Orders today"
          value={todayOrders}
          color="teal"
        />
        <StatCard
          icon="⏳"
          label="Pending"
          value={pending}
          color={pending > 0 ? 'amber' : 'gray'}
          pulse={pending > 0}
        />
        <StatCard
          icon="⭐"
          label={rating === null ? 'No rating yet' : 'Rating'}
          // The animated counter only handles whole numbers, so for the
          // rating we render the formatted number directly via `suffix` -
          // the component shows `0.0` while animating, which is fine for
          // < 1s but feels off for a static metric. For ratings we pass
          // the integer part and a fractional suffix so the count-up still
          // runs on the integer portion (4.8 → animates 0..4, then "4.8").
          value={rating === null ? 0 : Math.floor(rating)}
          suffix={rating === null ? '' : `.${Math.round((rating % 1) * 10)}`}
          color="vendor"
        />
      </section>

      <section aria-label="Compliance status">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mid">
          Compliance
        </h2>
        <ComplianceAlerts vendorId={vendorId} />
      </section>

      <section aria-label="Quick actions">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mid">
          Quick actions
        </h2>
        <QuickActions />
      </section>

      {isLoading && (
        <p className="text-xs text-mid">Loading the latest numbers…</p>
      )}
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
