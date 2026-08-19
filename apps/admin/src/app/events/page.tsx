import { redirect } from 'next/navigation';

/**
 * /events is a parallel model (EventEnquiry, customer-facing /events/new form).
 * For admin navigation it has been consolidated into the unified /catering section.
 * The EventsClient is preserved at apps/admin/src/app/events/events-client.tsx
 * for reference; the underlying /v1/event-enquiries API is unchanged.
 */
export default function EventsRedirect() {
  redirect('/catering');
}
