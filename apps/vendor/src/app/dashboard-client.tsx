'use client';

import { AtAGlance } from '@/components/dashboard/at-a-glance';
import { ComplianceAlerts } from '@/components/dashboard/compliance-alerts';
import { DashboardTopBar } from '@/components/dashboard/dashboard-top-bar';
import { OrdersDueToday } from '@/components/dashboard/orders-due-today';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { StatCard } from '@/components/dashboard/stat-card';
import { UpcomingOrders } from '@/components/dashboard/upcoming-orders';
import { useVendorDashboard } from '@/hooks/use-vendor-dashboard';
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
 * Vendor dashboard body. Reads stats live from `/vendors/me/stats`
 * (polled at 60s by the hook + invalidated by the realtime channel on
 * the orders page). The rating + business identity come down from the
 * server gate so the first paint always has a name + greeting without
 * flashing placeholder strings.
 *
 * Layout (matches the mockup):
 *   [top action bar — Add menu item / bell / help]
 *   [greeting header]
 *   [4 stat cards in a row]
 *   ┌────────────────────────┬─────────────────┐
 *   │ Due today              │ At a glance     │
 *   │ Next 7 days            │ (3 rows)        │
 *   └────────────────────────┴─────────────────┘
 *   [compliance banner]
 *   [quick actions row]
 */
export function DashboardClient({ vendorId, greetingName, businessName, rating }: Props) {
  const { data: stats, isLoading } = useVendorStats();
  const { data: dashboard } = useVendorDashboard();
  const greeting = greetingFor(new Date());

  const todayRevenuePounds = stats ? stats.today.revenuePence / 100 : 0;
  const todayOrders = stats?.today.orders ?? 0;
  const pending = stats?.pendingNow ?? 0;

  return (
    <div className="space-y-6">
      <DashboardTopBar />

      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-dark">
          {greeting}, {greetingName} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-sm text-mid">
          Here&rsquo;s how {businessName} is doing today.
        </p>
      </header>

      <section
        aria-label="Today at a glance"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          iconKey="revenue"
          label="Today's revenue"
          value={todayRevenuePounds}
          prefix="£"
          color="teal"
          hint={todayRevenuePounds === 0 ? 'No sales yet today' : undefined}
        />
        <StatCard
          iconKey="orders"
          label="Orders today"
          value={todayOrders}
          color="amber"
          hint={todayOrders === 0 ? 'No orders yet' : undefined}
        />
        <StatCard
          iconKey="pending"
          label="Pending orders"
          value={pending}
          color="brand"
          pulse={pending > 0}
          hint={pending === 0 ? 'Awaiting action' : `${pending} need${pending === 1 ? 's' : ''} a decision`}
        />
        <StatCard
          iconKey="rating"
          label={rating === null ? 'Rating' : 'Rating'}
          // The animated counter only handles whole numbers, so for the
          // rating we render the integer part and a fractional suffix
          // so the count-up still runs on the integer portion
          // (4.8 → animates 0..4, then "4.8").
          value={rating === null ? 0 : Math.floor(rating)}
          suffix={rating === null ? '.0' : `.${Math.round((rating % 1) * 10)}`}
          color="vendor"
          hint={rating === null ? 'No ratings yet' : undefined}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section aria-label="Orders due today">
            <PanelHeader title="Due today" />
            <OrdersDueToday orders={dashboard?.ordersDueToday ?? []} />
          </section>

          <section aria-label="Upcoming orders">
            <PanelHeader title="Next 7 days" />
            <UpcomingOrders orders={dashboard?.upcomingOrders ?? []} />
          </section>
        </div>

        <aside aria-label="Operations summary" className="lg:col-span-1">
          <AtAGlance
            eventEnquiries={dashboard?.eventEnquiries ?? { pending: 0, nextEventDate: null }}
            nextPayout={dashboard?.nextPayout ?? null}
            menuHealth={
              dashboard?.menuHealth ?? { missingImages: 0, missingAllergens: 0, items: [] }
            }
          />
        </aside>
      </div>

      <section aria-label="Compliance status">
        <ComplianceAlerts vendorId={vendorId} />
      </section>

      <section aria-label="Quick actions">
        <QuickActions />
      </section>

      {isLoading && (
        <p className="text-xs text-mid">Loading the latest numbers…</p>
      )}
    </div>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-sm font-bold text-dark">{title}</h2>
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
