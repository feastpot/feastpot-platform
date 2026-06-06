import type { Channel } from './templates';

/**
 * Canonical registry of user-facing notification preferences.
 *
 * SINGLE SOURCE OF TRUTH for three consumers:
 *   1. the preferences API (what toggles to show + their default state),
 *   2. the notification processor (which channels to gate before dispatch),
 *   3. the "cannot be disabled" (transactional) rule.
 *
 * Why code, not seeded DB rows: rows in `notification_preferences` are SPARSE -
 * a user only ever gets a row once they flip a default. A missing row falls
 * back to the `defaultEnabled` here, so pre-existing users work immediately with
 * no backfill and we never write a row just to record "still on the default".
 *
 * `key` is the notification EVENT name - identical to the BullMQ job name the
 * processor dispatches on (see `templates/index.ts`). Only events listed here
 * are gateable; any event NOT present (admin alerts, vendor payout/dispute
 * notices, compliance, etc.) always sends.
 *
 * `transactional` is per (key, channel): a channel a customer legally/operation-
 * ally must receive (order confirmation email, refund email) is locked on, while
 * a noisier channel for the same event (e.g. WhatsApp) can still be optional.
 */
export interface PreferenceDefinition {
  /** Event name == BullMQ job name == template key. */
  key: string;
  channel: Channel;
  /** Human label for the notification group (one per `key`). */
  groupLabel: string;
  /** Human label for the channel within the group. */
  channelLabel: string;
  /** State when the user has no stored row. */
  defaultEnabled: boolean;
  /** When true the channel is always delivered and cannot be turned off. */
  transactional: boolean;
}

const CHANNEL_LABEL: Record<Channel, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  push: 'Push',
};

/** Compact builder so the table below stays readable. */
function def(
  key: string,
  groupLabel: string,
  channel: Channel,
  opts: { default?: boolean; transactional?: boolean } = {},
): PreferenceDefinition {
  return {
    key,
    channel,
    groupLabel,
    channelLabel: CHANNEL_LABEL[channel],
    defaultEnabled: opts.transactional ? true : opts.default ?? true,
    transactional: opts.transactional ?? false,
  };
}

/**
 * The channels listed for each event MUST be a subset of that template's
 * declared `channels` in `templates/index.ts`, otherwise the toggle would gate
 * a channel the event never sends on.
 */
export const PREFERENCE_DEFINITIONS: readonly PreferenceDefinition[] = [
  // Order confirmation - email is the legal receipt (locked); rest optional.
  def('order_confirmation', 'Order confirmation', 'email', { transactional: true }),
  def('order_confirmation', 'Order confirmation', 'sms', { default: true }),
  def('order_confirmation', 'Order confirmation', 'whatsapp', { default: false }),
  def('order_confirmation', 'Order confirmation', 'push', { default: true }),

  // Order accepted - push is the primary "kitchen started" nudge (locked).
  def('order_accepted', 'Order accepted', 'push', { transactional: true }),
  def('order_accepted', 'Order accepted', 'email', { default: true }),
  def('order_accepted', 'Order accepted', 'sms', { default: false }),
  def('order_accepted', 'Order accepted', 'whatsapp', { default: false }),

  // Out for delivery - email locked (delivery record); rest optional.
  def('order_dispatched', 'Order on its way', 'email', { transactional: true }),
  def('order_dispatched', 'Order on its way', 'sms', { default: true }),
  def('order_dispatched', 'Order on its way', 'whatsapp', { default: false }),
  def('order_dispatched', 'Order on its way', 'push', { default: true }),

  // Delivered + review reminder - all optional (this is the "review nag").
  def('delivery_confirmed', 'Delivery & review reminder', 'email', { default: true }),
  def('delivery_confirmed', 'Delivery & review reminder', 'whatsapp', { default: false }),
  def('delivery_confirmed', 'Delivery & review reminder', 'push', { default: true }),

  // Order cancelled - email locked; push optional.
  def('order_cancelled_by_customer', 'Order cancelled', 'email', { transactional: true }),
  def('order_cancelled_by_customer', 'Order cancelled', 'push', { default: true }),

  // Refund issued - email locked (money movement record); push optional.
  def('refund_issued_customer', 'Refund issued', 'email', { transactional: true }),
  def('refund_issued_customer', 'Refund issued', 'push', { default: true }),

  // Running-late alerts - all optional.
  def('order_eta_overdue', 'Running late alerts', 'email', { default: true }),
  def('order_eta_overdue', 'Running late alerts', 'sms', { default: true }),
  def('order_eta_overdue', 'Running late alerts', 'push', { default: true }),
];

/** Fast lookup by `${key}:${channel}`. */
const BY_KEY_CHANNEL = new Map<string, PreferenceDefinition>(
  PREFERENCE_DEFINITIONS.map((d) => [`${d.key}:${d.channel}`, d]),
);

export function findPreferenceDefinition(
  key: string,
  channel: string,
): PreferenceDefinition | undefined {
  return BY_KEY_CHANNEL.get(`${key}:${channel}`);
}
