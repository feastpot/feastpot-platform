'use client';

import { Badge, Button, Card, CardContent } from '@feastpot/ui';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
import { useEventEnquiry, type EnquiryStatus } from '@/hooks/use-event-enquiries';
import { formatDate, formatPence } from '@/lib/format';

interface EnquiryDetailClientProps {
  enquiryId: string;
}

/**
 * D17 (S3): admin-only detail view for a single event enquiry.
 *
 * Backed by the existing GET /v1/event-enquiries/:id — that endpoint
 * already returns the full enquiry (with all quotes + selectedVendor)
 * unfiltered for admin callers, so a separate /admin/event-enquiries/:id
 * route would just duplicate logic.
 */
export function EnquiryDetailClient({ enquiryId }: EnquiryDetailClientProps) {
  const router = useRouter();
  const { data: enquiry, isLoading, error } = useEventEnquiry(enquiryId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load enquiry: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }
  if (!enquiry) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Enquiry not found.</CardContent>
      </Card>
    );
  }

  const customerName =
    `${enquiry.customer.firstName ?? ''} ${enquiry.customer.lastName ?? ''}`.trim() ||
    enquiry.customer.email;
  const guests = enquiry.finalGuestCount ?? enquiry.guestCount;
  const eventDateLong = new Date(enquiry.eventDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // The most recent submitted quote is the most useful single number to
  // surface — full thread is rendered in the Quotes section below.
  const acceptedQuote = enquiry.quotes.find((q) => q.status === 'accepted');
  const headlineQuote = acceptedQuote ?? enquiry.quotes[0] ?? null;

  return (
    <>
      <PageHeader
        title={`Event enquiry — ${customerName}`}
        description="Full enquiry brief, all vendor quotes, and the matched vendor."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <StatusPill status={enquiry.status} />
          </div>
        }
      />

      {/* Core details — 2-column grid on md+, single column on mobile. */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Customer" value={customerName} />
        <Field label="Email" value={enquiry.customer.email} />
        <Field label="Event date" value={eventDateLong} />
        <Field
          label="Guests"
          value={
            enquiry.finalGuestCount && enquiry.finalGuestCount !== enquiry.guestCount
              ? `${guests} (was ${enquiry.guestCount})`
              : `${guests}`
          }
        />
        <Field
          label="Budget"
          value={enquiry.budgetPence !== null ? `${formatPence(enquiry.budgetPence)} total` : 'Not specified'}
        />
        <Field
          label="Cuisines"
          value={enquiry.cuisines.length > 0 ? enquiry.cuisines.join(', ') : '—'}
        />
        <Field
          label="Dietary"
          value={enquiry.dietary.length > 0 ? enquiry.dietary.join(', ') : '—'}
        />
        <Field label="Postcode" value={enquiry.postcode.toUpperCase()} mono />
        <Field
          label="Selected vendor"
          value={enquiry.selectedVendor?.businessName ?? 'Not yet selected'}
        />
        <Field
          label="Quote deadline"
          value={enquiry.quoteDeadline ? formatDate(enquiry.quoteDeadline) : '—'}
        />
        <Field label="Submitted" value={formatDate(enquiry.createdAt)} />
        <Field label="Last updated" value={formatDate(enquiry.updatedAt)} />
      </div>

      {/* Headline quote (if any) */}
      {headlineQuote && headlineQuote.totalPence !== null && (
        <Card className="mb-6 border-blue-200 bg-blue-50/60">
          <CardContent className="py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-900">
              {acceptedQuote ? 'Accepted quote' : 'Latest quote'}
            </p>
            <p className="mt-1 text-2xl font-bold">{formatPence(headlineQuote.totalPence)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              from {headlineQuote.vendor.businessName}
              {headlineQuote.vendor.rating !== null
                ? ` · ★ ${headlineQuote.vendor.rating.toFixed(1)}`
                : ''}
            </p>
          </CardContent>
        </Card>
      )}

      {/* All quotes table */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-medium">All quotes ({enquiry.quotes.length})</h2>
          {enquiry.quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quotes submitted yet. Matched vendors:{' '}
              <span className="font-mono text-xs">{enquiry.matchedVendorIds.length}</span>
            </p>
          ) : (
            <div className="space-y-2">
              {enquiry.quotes.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <div>
                    <Link
                      href={`/vendors/${q.vendor.id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {q.vendor.businessName}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {q.status}
                      {q.vendor.rating !== null ? ` · ★ ${q.vendor.rating.toFixed(1)}` : ''}
                    </span>
                  </div>
                  <div className="text-right font-medium">
                    {q.totalPence !== null ? formatPence(q.totalPence) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer requirements / notes — nullable field on the schema. */}
      {('notes' in enquiry && (enquiry as { notes?: string | null }).notes) ? (
        <Card className="mb-6 border-amber-200 bg-amber-50/40">
          <CardContent className="py-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-900">
              Customer notes
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {(enquiry as { notes?: string | null }).notes}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Cross-app navigation. /admin/users doesn't take an email query
          today, so we just link to the user list and the operator filters. */}
      <div className="flex flex-wrap gap-2">
        <Link href={`/users?email=${encodeURIComponent(enquiry.customer.email)}`}>
          <Button variant="outline" size="sm">
            View customer
            <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
          </Button>
        </Link>
        {enquiry.selectedVendor && (
          <Link href={`/vendors/${enquiry.selectedVendor.id}`}>
            <Button variant="outline" size="sm">
              View selected vendor
              <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
            </Button>
          </Link>
        )}
      </div>
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: EnquiryStatus }) {
  const styles: Record<EnquiryStatus, string> = {
    open: 'bg-amber-100 text-amber-900',
    quoted: 'bg-blue-100 text-blue-900',
    confirmed: 'bg-emerald-100 text-emerald-900',
    completed: 'bg-teal-light text-teal-dark',
    cancelled: 'bg-red-100 text-red-900',
    expired: 'bg-stone-200 text-stone-800',
  };
  return <Badge className={styles[status]}>{status}</Badge>;
}
