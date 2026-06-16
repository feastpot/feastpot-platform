'use client';

import { Bell } from 'lucide-react';

import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/use-notification-preferences';
import type { NotificationPreference } from '@/lib/api/notification-preferences';

/**
 * Customer notification opt-outs. The full preference matrix is computed
 * server-side (coded defaults merged over stored overrides), so we just group
 * the flat list by notification event and render a toggle per channel.
 * Transactional channels (`canDisable: false`) render a non-interactive
 * "Required" pill instead of a switch.
 */
export default function NotificationSettingsPage() {
  const { data: preferences, isLoading, isError } = useNotificationPreferences();
  const { mutate: updatePref, isPending } = useUpdateNotificationPreferences();

  const groups = groupByKey(preferences ?? []);

  return (
    <div className="space-y-5 px-4 py-4">
      <header className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light"
          aria-hidden
        >
          <Bell className="h-5 w-5 text-brand" />
        </span>
        <div>
          <h1 className="font-display text-lg font-black text-charcoal">Notifications</h1>
          <p className="text-xs font-medium text-charcoal-mid">Choose how we keep you posted</p>
        </div>
      </header>

      <p className="rounded-2xl border border-cream-deep bg-cream-warm/60 p-3 text-[13px] font-medium leading-relaxed text-charcoal-mid">
        Order confirmations, cancellations and refund emails can&rsquo;t be turned off &mdash;
        they&rsquo;re required for your orders.
      </p>

      {isLoading && (
        <p className="py-8 text-center text-sm font-medium text-charcoal-mid">Loading…</p>
      )}
      {isError && (
        <p className="rounded-2xl border border-brand/30 bg-brand-light p-4 text-sm font-medium text-brand">
          Couldn&rsquo;t load your notification settings. Please try again.
        </p>
      )}

      {!isLoading &&
        !isError &&
        groups.map((group) => (
          <section
            key={group.key}
            className="rounded-2xl border border-cream-deep bg-white p-4 shadow-card"
          >
            <p className="font-display text-sm font-black text-charcoal">{group.groupLabel}</p>
            <ul className="mt-2 divide-y divide-cream-warm">
              {group.items.map((pref) => (
                <li
                  key={`${pref.key}-${pref.channel}`}
                  className="flex items-center justify-between py-3"
                >
                  <span className="text-sm font-medium text-charcoal">{pref.channelLabel}</span>
                  {pref.canDisable ? (
                    <Toggle
                      checked={pref.enabled}
                      disabled={isPending}
                      onChange={(enabled) =>
                        updatePref([{ channel: pref.channel, key: pref.key, enabled }])
                      }
                      label={`${pref.groupLabel} via ${pref.channelLabel}`}
                    />
                  ) : (
                    <span className="rounded-md bg-teal/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-teal">
                      Required
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

interface PreferenceGroup {
  key: string;
  groupLabel: string;
  items: NotificationPreference[];
}

/** Group the flat preference list by event key, preserving server order. */
function groupByKey(prefs: NotificationPreference[]): PreferenceGroup[] {
  const order: string[] = [];
  const map = new Map<string, PreferenceGroup>();
  for (const pref of prefs) {
    let group = map.get(pref.key);
    if (!group) {
      group = { key: pref.key, groupLabel: pref.groupLabel, items: [] };
      map.set(pref.key, group);
      order.push(pref.key);
    }
    group.items.push(pref);
  }
  return order.map((k) => map.get(k)!);
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-teal' : 'bg-cream-deep'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
