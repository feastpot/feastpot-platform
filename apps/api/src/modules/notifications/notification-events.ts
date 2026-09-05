/**
 * Canonical names accepted by the notifications queue.  A name must be added
 * here before a producer can persist or enqueue it.
 */
export const NOTIFICATION_EVENTS = {
  menu_allergen_action_required: { templateBacked: true },
  event_enquiry_matched: { templateBacked: true },
  event_quote_received: { templateBacked: true },
  event_reminder_72h: { templateBacked: true },
  event_balance_link: { templateBacked: true },
  order_confirmation: { templateBacked: true },
  order_accepted: { templateBacked: true },
  order_dispatched: { templateBacked: true },
  delivery_confirmed: { templateBacked: true },
  order_cancelled_by_customer: { templateBacked: true },
  order_cancelled_vendor_alert: { templateBacked: true },
  order_amendment_proposed: { templateBacked: true },
  order_amendment_resolved: { templateBacked: true },
  order_eta_overdue: { templateBacked: true },
  refund_issued_customer: { templateBacked: true },
  refund_deducted_vendor: { templateBacked: true },
  payout_batch_ready: { templateBacked: true },
  payout_transferred: { templateBacked: true },
  payout_held: { templateBacked: true },
  payout_failed_terminal: { templateBacked: true },
  dispute_raised: { templateBacked: true },
  dispute_vendor_responded: { templateBacked: true },
  dispute_escalated: { templateBacked: true },
  dispute_resolved: { templateBacked: true },
  document_expiring: { templateBacked: true },
  document_expired: { templateBacked: true },
  verification_renewal_due: { templateBacked: true },
  verification_suspended: { templateBacked: true },
  vendor_menu_allergen_remediation: { templateBacked: true, productionProducer: false },
  account_credit_issued: { templateBacked: true },
  account_suspended: { templateBacked: true },
  notify_vendor: { templateBacked: true },
  vendor_onboarding_complete: { templateBacked: true, productionProducer: false },
  vendor_approved: { templateBacked: true },
  enquiry_expired: { templateBacked: true },
  review_request: { templateBacked: true },
  dispute_appeal_submitted: { templateBacked: true },
  dispute_appeal_decided: { templateBacked: true },
  dispute_appeal_payout_credit: { templateBacked: true },
  enforcement_action: { templateBacked: true },
  enforcement_lifted: { templateBacked: true },
  hmrc_copy_sent: { templateBacked: true },
  hmrc_deadline_alert: { templateBacked: true },
  hmrc_verification_failed: { templateBacked: true },
  catering_assignment: { templateBacked: true },
  catering_assignment_cancelled: { templateBacked: true },
  catering_deposit_received: { templateBacked: true },
  referral_rewarded: { templateBacked: false },
  points_expired: { templateBacked: false },
  catering_completed: { templateBacked: false },
  review_trigger: { templateBacked: false },
  expire_amendment: { templateBacked: false },
  eta_overdue: { templateBacked: false },
  vendor_application_email_raw: { templateBacked: false },
} as const;

export type NotificationEventName = keyof typeof NOTIFICATION_EVENTS;
export type TemplateNotificationEventName = {
  [Name in NotificationEventName]: (typeof NOTIFICATION_EVENTS)[Name]['templateBacked'] extends true
    ? Name
    : never;
}[NotificationEventName];
export const NOTIFICATION_EVENT_NAMES = Object.keys(NOTIFICATION_EVENTS) as NotificationEventName[];
/** Typed event constants for every queue producer. */
export const NotificationEvent = Object.fromEntries(
  NOTIFICATION_EVENT_NAMES.map((name) => [name, name]),
) as { readonly [Name in NotificationEventName]: Name };
export const TEMPLATE_NOTIFICATION_EVENT_NAMES = NOTIFICATION_EVENT_NAMES.filter(
  (name) => NOTIFICATION_EVENTS[name].templateBacked,
) as TemplateNotificationEventName[];
export const SYSTEM_NOTIFICATION_EVENT_NAMES = NOTIFICATION_EVENT_NAMES.filter(
  (name) => !NOTIFICATION_EVENTS[name].templateBacked,
);

export function isNotificationEventName(value: string): value is NotificationEventName {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENTS, value);
}

export function isTemplateNotificationEventName(
  value: string,
): value is (typeof TEMPLATE_NOTIFICATION_EVENT_NAMES)[number] {
  return isNotificationEventName(value) && NOTIFICATION_EVENTS[value].templateBacked;
}

/** Boundary guard for controller/request/database sourced names. */
export function assertNotificationEventName(value: string): asserts value is NotificationEventName {
  if (!isNotificationEventName(value)) {
    throw new Error(`Unknown notification event "${value}". Refusing to enqueue or persist it.`);
  }
}
