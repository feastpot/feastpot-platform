'use client';

import { type FormEvent, useState } from 'react';

import { apiRequest } from '@/lib/api/client';

// ─── Shared ───────────────────────────────────────────────────────────────────

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?(\s*[0-9][A-Z]{2})?$/i;

// ─── Waitlist form ────────────────────────────────────────────────────────────

interface WaitlistFields {
  postcode: string;
  email: string;
  whatsapp: string;
  cuisine: string;
}

function validateWaitlist(f: WaitlistFields): Partial<WaitlistFields> {
  const errs: Partial<WaitlistFields> = {};
  if (!f.postcode.trim()) errs.postcode = 'Enter your postcode.';
  else if (!UK_POSTCODE_RE.test(f.postcode.trim()))
    errs.postcode = 'Enter a valid UK postcode, for example SE15 or SE15 4EE.';
  if (!f.email.trim()) errs.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
    errs.email = 'Enter a valid email address.';
  return errs;
}

export interface WaitlistFormProps {
  /** Pre-fill the postcode field (e.g. from the search page URL). */
  initialPostcode?: string;
  /**
   * Waitlist source tag sent to the API.
   * @default 'homepage'
   */
  source?: 'homepage' | 'search-empty' | 'occasion' | 'catering';
  /** Label for the submit button. */
  submitLabel?: string;
}

/**
 * Waitlist sign-up form - POSTs to POST /v1/waitlist.
 * Exported so it can be reused in the /vendors empty state.
 */
export function WaitlistForm({
  initialPostcode = '',
  source = 'homepage',
  submitLabel = 'Notify me when cooks are available',
}: WaitlistFormProps) {
  const [fields, setFields] = useState<WaitlistFields>({
    postcode: initialPostcode,
    email: '',
    whatsapp: '',
    cuisine: '',
  });
  const [errors, setErrors] = useState<Partial<WaitlistFields>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  function set(k: keyof WaitlistFields, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateWaitlist(fields);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    setServerError('');
    try {
      await apiRequest('/waitlist', {
        method: 'POST',
        body: {
          postcode: fields.postcode.trim().toUpperCase(),
          email: fields.email.trim(),
          ...(fields.whatsapp.trim() && { whatsapp: fields.whatsapp.trim() }),
          ...(fields.cuisine.trim() && { cuisine: fields.cuisine.trim() }),
          source,
          website: '', // honeypot - bots fill this, humans leave it blank
        },
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      // Treat 409 DUPLICATE as success - user is already signed up.
      if (msg.includes('already') || msg.includes('duplicate') || msg.includes('DUPLICATE')) {
        setSuccess(true);
      } else {
        setServerError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-brand-light bg-brand-light/40 px-5 py-6 text-center"
      >
        <p className="font-display text-[16px] font-black text-brand">You are on the list.</p>
        <p className="mt-1 text-[13px] font-medium text-charcoal-mid">
          We will message you when cooks start delivering to your postcode.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Waitlist sign-up">
      {/* Honeypot - hidden from real users */}
      <input
        type="text"
        name="website"
        aria-hidden
        tabIndex={-1}
        className="absolute -left-[9999px] opacity-0"
        autoComplete="off"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Postcode */}
        <div>
          <label htmlFor="wl-postcode" className="mb-1 block text-[12px] font-bold text-charcoal">
            Postcode{' '}
            <span aria-hidden className="text-scotch">
              *
            </span>
          </label>
          <input
            id="wl-postcode"
            type="text"
            value={fields.postcode}
            onChange={(e) => set('postcode', e.target.value)}
            placeholder="e.g. SE15"
            autoComplete="postal-code"
            aria-describedby={errors.postcode ? 'wl-postcode-err' : undefined}
            aria-invalid={!!errors.postcode}
            className={`h-10 w-full rounded-lg border px-3 text-[13px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30 ${
              errors.postcode ? 'border-scotch bg-scotch/5' : 'border-border bg-white'
            }`}
          />
          {errors.postcode && (
            <p
              id="wl-postcode-err"
              role="alert"
              className="mt-1 text-[12px] font-medium text-scotch"
            >
              {errors.postcode}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="wl-email" className="mb-1 block text-[12px] font-bold text-charcoal">
            Email{' '}
            <span aria-hidden className="text-scotch">
              *
            </span>
          </label>
          <input
            id="wl-email"
            type="email"
            value={fields.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-describedby={errors.email ? 'wl-email-err' : undefined}
            aria-invalid={!!errors.email}
            className={`h-10 w-full rounded-lg border px-3 text-[13px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30 ${
              errors.email ? 'border-scotch bg-scotch/5' : 'border-border bg-white'
            }`}
          />
          {errors.email && (
            <p id="wl-email-err" role="alert" className="mt-1 text-[12px] font-medium text-scotch">
              {errors.email}
            </p>
          )}
        </div>

        {/* WhatsApp (optional) */}
        <div>
          <label htmlFor="wl-whatsapp" className="mb-1 block text-[12px] font-bold text-charcoal">
            WhatsApp number <span className="font-medium text-charcoal-light">(optional)</span>
          </label>
          <input
            id="wl-whatsapp"
            type="tel"
            value={fields.whatsapp}
            onChange={(e) => set('whatsapp', e.target.value)}
            placeholder="+44 7700 900000"
            autoComplete="tel"
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30"
          />
        </div>

        {/* Favourite cuisine (optional) */}
        <div>
          <label htmlFor="wl-cuisine" className="mb-1 block text-[12px] font-bold text-charcoal">
            Favourite cuisine <span className="font-medium text-charcoal-light">(optional)</span>
          </label>
          <input
            id="wl-cuisine"
            type="text"
            value={fields.cuisine}
            onChange={(e) => set('cuisine', e.target.value)}
            placeholder="e.g. Nigerian, Caribbean"
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>

      {serverError && (
        <p role="alert" className="mt-3 text-[12px] font-medium text-scotch">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:opacity-60"
      >
        {submitting ? 'Sending…' : submitLabel}
      </button>
    </form>
  );
}

// ─── Vendor recommendation form ───────────────────────────────────────────────

interface RecommendFields {
  contactRef: string;
  postcode: string;
}

function validateRecommend(f: RecommendFields): Partial<RecommendFields> {
  const errs: Partial<RecommendFields> = {};
  if (!f.contactRef.trim() || f.contactRef.trim().length < 2)
    errs.contactRef = 'Enter an Instagram handle, business name or phone number.';
  if (f.postcode.trim() && !UK_POSTCODE_RE.test(f.postcode.trim()))
    errs.postcode = 'Enter a valid UK postcode, for example SE15 or SE15 4EE.';
  return errs;
}

/** Detect whether the raw input looks like a phone, instagram handle, or business name. */
function parseContactRef(raw: string): {
  instagramHandle?: string;
  phone?: string;
  businessName?: string;
} {
  const s = raw.trim();
  if (/^@/.test(s)) return { instagramHandle: s.replace(/^@/, '') };
  if (/^\+?[\d\s\-()]{7,}$/.test(s)) return { phone: s };
  return { businessName: s };
}

export interface RecommendFormProps {
  /** Submit button label. */
  submitLabel?: string;
}

/**
 * Vendor recommendation form - POSTs to POST /v1/vendor-recommendations.
 * Exported so it can be reused in the /vendors empty state.
 */
export function RecommendForm({ submitLabel = 'Recommend a cook' }: RecommendFormProps) {
  const [fields, setFields] = useState<RecommendFields>({ contactRef: '', postcode: '' });
  const [errors, setErrors] = useState<Partial<RecommendFields>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  function set(k: keyof RecommendFields, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateRecommend(fields);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    setServerError('');
    try {
      await apiRequest('/vendor-recommendations', {
        method: 'POST',
        body: {
          ...parseContactRef(fields.contactRef),
          ...(fields.postcode.trim() && {
            postcode: fields.postcode.trim().toUpperCase(),
          }),
          website: '', // honeypot
        },
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-brand-light bg-brand-light/40 px-5 py-6 text-center"
      >
        <p className="font-display text-[16px] font-black text-brand">Thanks for the tip.</p>
        <p className="mt-1 text-[13px] font-medium text-charcoal-mid">
          We will reach out to them about joining Feastpot.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Recommend a cook">
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        aria-hidden
        tabIndex={-1}
        className="absolute -left-[9999px] opacity-0"
        autoComplete="off"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Single contact field */}
        <div className="sm:col-span-2">
          <label htmlFor="rec-contact" className="mb-1 block text-[12px] font-bold text-charcoal">
            Instagram handle, business name or phone number{' '}
            <span aria-hidden className="text-scotch">
              *
            </span>
          </label>
          <input
            id="rec-contact"
            type="text"
            value={fields.contactRef}
            onChange={(e) => set('contactRef', e.target.value)}
            placeholder="@cookname, Mama Ngozi Kitchen, or +44 7700 900000"
            aria-describedby={errors.contactRef ? 'rec-contact-err' : undefined}
            aria-invalid={!!errors.contactRef}
            className={`h-10 w-full rounded-lg border px-3 text-[13px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30 ${
              errors.contactRef ? 'border-scotch bg-scotch/5' : 'border-border bg-white'
            }`}
          />
          {errors.contactRef && (
            <p
              id="rec-contact-err"
              role="alert"
              className="mt-1 text-[12px] font-medium text-scotch"
            >
              {errors.contactRef}
            </p>
          )}
        </div>

        {/* Postcode (optional) */}
        <div>
          <label htmlFor="rec-postcode" className="mb-1 block text-[12px] font-bold text-charcoal">
            Their area <span className="font-medium text-charcoal-light">(optional)</span>
          </label>
          <input
            id="rec-postcode"
            type="text"
            value={fields.postcode}
            onChange={(e) => set('postcode', e.target.value)}
            placeholder="e.g. SE15"
            autoComplete="postal-code"
            aria-describedby={errors.postcode ? 'rec-postcode-err' : undefined}
            aria-invalid={!!errors.postcode}
            className={`h-10 w-full rounded-lg border px-3 text-[13px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30 ${
              errors.postcode ? 'border-scotch bg-scotch/5' : 'border-border bg-white'
            }`}
          />
          {errors.postcode && (
            <p
              id="rec-postcode-err"
              role="alert"
              className="mt-1 text-[12px] font-medium text-scotch"
            >
              {errors.postcode}
            </p>
          )}
        </div>
      </div>

      {serverError && (
        <p role="alert" className="mt-3 text-[12px] font-medium text-scotch">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-charcoal px-5 text-sm font-bold text-white shadow-card transition-colors hover:bg-charcoal-mid disabled:opacity-60"
      >
        {submitting ? 'Sending…' : submitLabel}
      </button>
    </form>
  );
}

// ─── Composite block (homepage) ───────────────────────────────────────────────

/**
 * "No cooks in your postcode yet?" - two side-by-side cards on the homepage:
 *   A. Postcode waitlist → POST /v1/waitlist (source: homepage)
 *   B. Vendor recommendation → POST /v1/vendor-recommendations
 */
export function WaitlistBlock() {
  return (
    <section
      aria-labelledby="waitlist-block-heading"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
        Coming soon to your area
      </p>
      <h2
        id="waitlist-block-heading"
        className="mt-1 font-display text-[26px] font-black leading-tight text-charcoal sm:text-3xl"
      >
        No cooks in your postcode yet?
      </h2>
      <p className="mt-2 max-w-2xl text-[14px] font-medium leading-relaxed text-charcoal-mid">
        We open postcode by postcode so you only see cooks who can actually deliver to you. Tell us
        where you are and who you want to see on Feastpot.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Waitlist card */}
        <div className="rounded-2xl border border-cream-deep bg-white p-6 shadow-card">
          <p className="font-display text-[16px] font-black text-charcoal">
            Notify me when cooks arrive
          </p>
          <p className="mt-1 mb-4 text-[13px] font-medium text-charcoal-mid">
            Leave your details and we will message you the moment a cook starts delivering to your
            postcode.
          </p>
          <WaitlistForm source="homepage" />
        </div>

        {/* Recommend a cook card */}
        <div className="rounded-2xl border border-cream-deep bg-white p-6 shadow-card">
          <p className="font-display text-[16px] font-black text-charcoal">
            Know a cook we should invite?
          </p>
          <p className="mt-1 mb-4 text-[13px] font-medium text-charcoal-mid">
            Share their Instagram, business name or phone number. We will reach out about joining
            the platform.
          </p>
          <RecommendForm />
        </div>
      </div>
    </section>
  );
}
