'use client';

import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiRequest } from '@/lib/api/client';
import { normalisePostcode } from '@/lib/postcode';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;
const SESSION_KEY = 'feastpot.catering-funnel';
const UK_PC = /^[A-Z]{1,2}[0-9][0-9A-Z]?(\s*[0-9][A-Z]{2})?$/i;

const OCCASION_OPTIONS = [
  'Birthday party',
  'Baby shower',
  'Wedding',
  'Church event',
  'Office lunch',
  'Funeral or memorial',
  'Family gathering',
  'Other',
] as const;

const GUEST_OPTIONS: Array<{ label: string; dto: string }> = [
  { label: '10 to 20', dto: '11-25' },
  { label: '20 to 40', dto: '26-50' },
  { label: '40 to 80', dto: '51-100' },
  { label: '80 plus', dto: '101-200' },
];

const CUISINE_OPTIONS = [
  'Nigerian',
  'Ghanaian',
  'Jamaican',
  'Caribbean',
  'Mixed African and Caribbean',
  'Vegetarian friendly',
  'Not sure yet',
] as const;

const BUDGET_OPTIONS: Array<{ label: string; dto: string }> = [
  { label: 'Under £100', dto: 'under-500' },
  { label: '£100 to £250', dto: 'under-500' },
  { label: '£250 to £500', dto: 'under-500' },
  { label: '£500 to £1,000', dto: '500-1000' },
  { label: '£1,000 plus', dto: '1000-2500' },
];

const HEAR_ABOUT_OPTIONS = [
  'Instagram',
  'TikTok',
  'Google',
  'Word of mouth',
  'Referred by a vendor',
  'Other',
] as const;

const SLUG_TO_OCCASION: Record<string, string> = {
  'birthday-party-trays': 'Birthday party',
  'baby-shower-food': 'Baby shower',
  'wedding-and-events': 'Wedding',
  'office-catering': 'Office lunch',
  'sunday-family-meal': 'Family gathering',
  'small-chops': 'Other',
  'frozen-soup-packs': 'Other',
  'weekly-meal-prep': 'Other',
};

const STEP_LABELS = [
  'Your event',
  'Guest count',
  'Food style',
  'Location and date',
  'Budget',
  'Contact details',
];

// ─── State ────────────────────────────────────────────────────────────────────

interface FunnelState {
  step1?: string;
  step2Label?: string;
  step2Dto?: string;
  step3?: string;
  step4Postcode?: string;
  step4Date?: string;
  step4Time?: string;
  step5Label?: string;
  step5Dto?: string;
  step6Name?: string;
  step6Email?: string;
  step6Phone?: string;
  step6Notes?: string;
  step6HearAboutUs?: string;
}

function loadState(): FunnelState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as FunnelState) : {};
  } catch {
    return {};
  }
}

function saveState(s: FunnelState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
}

function clearState(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${step} of ${total}`}
      className="h-1.5 w-full overflow-hidden rounded-full bg-cream-deep"
    >
      <div
        className="h-full rounded-full bg-brand transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function OptionCard({
  id,
  name,
  label,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-brand/40 focus-within:ring-offset-1 ${
        checked
          ? 'border-brand bg-brand-light text-brand-dark'
          : 'border-cream-deep bg-white text-charcoal hover:border-brand/40'
      }`}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          checked ? 'border-brand' : 'border-charcoal-light'
        }`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
      </span>
      <span className="text-[15px] font-bold leading-snug">{label}</span>
    </label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[12px] font-medium text-scotch">
      {message}
    </p>
  );
}

// ─── Funnel ───────────────────────────────────────────────────────────────────

export function CateringFunnel() {
  const router = useRouter();
  const params = useSearchParams();

  const occasionParam = params?.get('occasion') ?? null;
  const rawStep = parseInt(params?.get('step') ?? '1', 10);
  const step = Number.isFinite(rawStep) && rawStep >= 1 && rawStep <= TOTAL_STEPS ? rawStep : 1;

  const [state, setState] = useState<FunnelState>(() => loadState());
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submittingRef = useRef(false);

  // Pre-select occasion from slug on first mount.
  useEffect(() => {
    if (!occasionParam) return;
    const label = SLUG_TO_OCCASION[occasionParam];
    if (label && !state.step1) {
      setState((prev) => {
        const next = { ...prev, step1: label };
        saveState(next);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occasionParam]);

  // If we land on step > 1 with empty storage, reset to step 1.
  useEffect(() => {
    if (step > 1 && !state.step1) {
      goToStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((partial: Partial<FunnelState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      saveState(next);
      return next;
    });
    if (Object.keys(partial).length) {
      const clearedKeys = Object.keys(partial).map((k) => k.replace('step4', ''));
      setErrors((prev) => {
        const next = { ...prev };
        clearedKeys.forEach((k) => delete next[k.toLowerCase()]);
        return next;
      });
    }
  }, []);

  function goToStep(n: number) {
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(n));
    url.searchParams.delete('occasion');
    router.replace(url.pathname + url.search, { scroll: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validateStep4(): boolean {
    const e: Record<string, string> = {};
    const pc = (state.step4Postcode ?? '').trim();
    if (!pc) {
      e.postcode = 'Enter your postcode.';
    } else if (!UK_PC.test(pc)) {
      e.postcode = 'Enter a valid UK postcode, for example SE15 or SE15 4EE.';
    }
    const dateVal = state.step4Date ?? '';
    if (dateVal) {
      const d = new Date(dateVal);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(d.getTime())) {
        e.date = 'Enter a valid date.';
      } else if (d < today) {
        e.date = 'Event date cannot be in the past.';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep6(): boolean {
    const e: Record<string, string> = {};
    if (!(state.step6Name ?? '').trim()) e.name = 'Enter your name.';
    const email = (state.step6Email ?? '').trim();
    if (!email) e.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function tryAdvance() {
    setErrors({});
    switch (step) {
      case 1:
        if (!state.step1) {
          setErrors({ step1: 'Please choose an option to continue.' });
          return;
        }
        break;
      case 2:
        if (!state.step2Label) {
          setErrors({ step2: 'Please choose a guest count to continue.' });
          return;
        }
        break;
      case 3:
        if (!state.step3) {
          setErrors({ step3: 'Please choose a food style to continue.' });
          return;
        }
        break;
      case 4:
        if (!validateStep4()) return;
        break;
      case 5:
        if (!state.step5Label) {
          setErrors({ step5: 'Please choose a budget range to continue.' });
          return;
        }
        break;
    }
    goToStep(step + 1);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validateStep6()) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setServerError('');
    try {
      const postcode =
        normalisePostcode(state.step4Postcode ?? '') ??
        (state.step4Postcode ?? '').trim().toUpperCase();
      const notesLines = [
        state.step6Notes?.trim(),
        state.step5Label ? `Budget preference: ${state.step5Label}` : '',
      ].filter(Boolean);

      await apiRequest('/catering-enquiries', {
        method: 'POST',
        body: {
          occasionType: state.step1 ?? 'Other',
          guestCountBand: state.step2Dto ?? '11-25',
          cuisineStyle: state.step3 !== 'Not sure yet' ? state.step3 : undefined,
          postcode,
          ...(state.step4Date && { eventDate: state.step4Date }),
          ...(state.step4Time?.trim() && { preferredTime: state.step4Time.trim() }),
          ...(state.step5Dto && { budgetBand: state.step5Dto }),
          contactName: (state.step6Name ?? '').trim(),
          email: (state.step6Email ?? '').trim(),
          ...(state.step6Phone?.trim() && { phone: state.step6Phone.trim() }),
          ...(notesLines.length && { notes: notesLines.join('\n\n') }),
          ...(state.step6HearAboutUs && { hearAboutUs: state.step6HearAboutUs }),
          source: 'web',
          website: '', // honeypot - must be blank
        },
      });
      clearState();
      setConfirmed(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setServerError(msg);
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  // ── Keyboard: Enter advances when step is valid ───────────────────────────

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'BUTTON') return;
      if (step < TOTAL_STEPS) tryAdvance();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state]);

  // ── Confirmation ──────────────────────────────────────────────────────────

  if (confirmed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-light">
          <CheckCircle2 className="h-8 w-8 text-brand" strokeWidth={2} aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-black text-charcoal">
          Your feast request has been received.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[14px] font-medium leading-relaxed text-charcoal-mid">
          We will use your postcode, date, guest count and food preferences to help match you with
          suitable vendors.
        </p>
        <Link
          href="/vendors"
          className="mt-7 inline-flex items-center rounded-xl border border-cream-deep bg-white px-6 py-3 text-sm font-bold text-charcoal transition-colors hover:bg-brand-light hover:text-brand-dark"
        >
          Browse all vendors
        </Link>
      </div>
    );
  }

  // ── Step content ──────────────────────────────────────────────────────────

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-8 sm:px-6">
      {/* Entry heading - only on step 1 */}
      {step === 1 && (
        <div className="mb-6">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
            Catering enquiry
          </p>
          <h1 className="mt-1 font-display text-[28px] font-black leading-tight text-charcoal sm:text-3xl">
            Planning food for 20 or more people?
          </h1>
          <p className="mt-2 text-[14px] font-medium leading-relaxed text-charcoal-mid">
            Tell us what you need and we will help you find suitable vendors for your event.
          </p>
        </div>
      )}

      {/* Progress */}
      <div className="mb-6 space-y-2">
        <span className="text-[12px] font-bold text-charcoal-mid">
          Step {step} of {TOTAL_STEPS}: {STEP_LABELS[step - 1]}
        </span>
        <ProgressBar step={step} total={TOTAL_STEPS} />
      </div>

      {/* Step 1: Occasion */}
      {step === 1 && (
        <fieldset>
          <legend className="mb-4 font-display text-xl font-black text-charcoal sm:text-2xl">
            What are you planning?
          </legend>
          {errors.step1 && (
            <p role="alert" className="mb-3 text-[13px] font-medium text-scotch">
              {errors.step1}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {OCCASION_OPTIONS.map((opt) => (
              <OptionCard
                key={opt}
                id={`occasion-${opt}`}
                name="occasionType"
                label={opt}
                checked={state.step1 === opt}
                onChange={() => update({ step1: opt })}
              />
            ))}
          </div>
        </fieldset>
      )}

      {/* Step 2: Guest count */}
      {step === 2 && (
        <fieldset>
          <legend className="mb-4 font-display text-xl font-black text-charcoal sm:text-2xl">
            How many people are you feeding?
          </legend>
          {errors.step2 && (
            <p role="alert" className="mb-3 text-[13px] font-medium text-scotch">
              {errors.step2}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {GUEST_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.label}
                id={`guests-${opt.label}`}
                name="guestCount"
                label={opt.label}
                checked={state.step2Label === opt.label}
                onChange={() => update({ step2Label: opt.label, step2Dto: opt.dto })}
              />
            ))}
          </div>
        </fieldset>
      )}

      {/* Step 3: Food style */}
      {step === 3 && (
        <fieldset>
          <legend className="mb-4 font-display text-xl font-black text-charcoal sm:text-2xl">
            What food style do you want?
          </legend>
          {errors.step3 && (
            <p role="alert" className="mb-3 text-[13px] font-medium text-scotch">
              {errors.step3}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {CUISINE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt}
                id={`cuisine-${opt}`}
                name="cuisineStyle"
                label={opt}
                checked={state.step3 === opt}
                onChange={() => update({ step3: opt })}
              />
            ))}
          </div>
        </fieldset>
      )}

      {/* Step 4: Location and date */}
      {step === 4 && (
        <div>
          <h2 className="mb-5 font-display text-xl font-black text-charcoal sm:text-2xl">
            Where should the food go?
          </h2>
          <div className="space-y-4">
            {/* Postcode */}
            <div>
              <label
                htmlFor="s4-postcode"
                className="mb-1 block text-[13px] font-bold text-charcoal"
              >
                Postcode{' '}
                <span aria-hidden className="text-scotch">
                  *
                </span>
              </label>
              <input
                id="s4-postcode"
                type="text"
                autoComplete="postal-code"
                value={state.step4Postcode ?? ''}
                onChange={(e) => {
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n.postcode;
                    return n;
                  });
                  update({ step4Postcode: e.target.value });
                }}
                placeholder="e.g. SE15 or SE15 4EE"
                aria-invalid={!!errors.postcode}
                aria-describedby={errors.postcode ? 's4-postcode-err' : undefined}
                className={`h-12 w-full rounded-xl border px-4 text-[15px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30 ${
                  errors.postcode ? 'border-scotch bg-scotch/5' : 'border-cream-deep bg-white'
                }`}
              />
              <FieldError id="s4-postcode-err" message={errors.postcode} />
            </div>

            {/* Event date */}
            <div>
              <label htmlFor="s4-date" className="mb-1 block text-[13px] font-bold text-charcoal">
                Event date <span className="font-medium text-charcoal-light">(optional)</span>
              </label>
              <input
                id="s4-date"
                type="date"
                min={todayStr}
                value={state.step4Date ?? ''}
                onChange={(e) => {
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n.date;
                    return n;
                  });
                  update({ step4Date: e.target.value });
                }}
                aria-invalid={!!errors.date}
                aria-describedby={errors.date ? 's4-date-err' : undefined}
                className={`h-12 w-full rounded-xl border px-4 text-[15px] font-medium text-charcoal outline-none focus:ring-2 focus:ring-brand/30 ${
                  errors.date ? 'border-scotch bg-scotch/5' : 'border-cream-deep bg-white'
                }`}
              />
              <FieldError id="s4-date-err" message={errors.date} />
            </div>

            {/* Preferred time */}
            <div>
              <label htmlFor="s4-time" className="mb-1 block text-[13px] font-bold text-charcoal">
                Preferred time <span className="font-medium text-charcoal-light">(optional)</span>
              </label>
              <input
                id="s4-time"
                type="text"
                value={state.step4Time ?? ''}
                onChange={(e) => update({ step4Time: e.target.value })}
                placeholder="e.g. 12 noon, afternoon, 6 pm"
                className="h-12 w-full rounded-xl border border-cream-deep bg-white px-4 text-[15px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Budget */}
      {step === 5 && (
        <fieldset>
          <legend className="mb-4 font-display text-xl font-black text-charcoal sm:text-2xl">
            What budget are you working with?
          </legend>
          {errors.step5 && (
            <p role="alert" className="mb-3 text-[13px] font-medium text-scotch">
              {errors.step5}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {BUDGET_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.label}
                id={`budget-${opt.label}`}
                name="budget"
                label={opt.label}
                checked={state.step5Label === opt.label}
                onChange={() => update({ step5Label: opt.label, step5Dto: opt.dto })}
              />
            ))}
          </div>
        </fieldset>
      )}

      {/* Step 6: Contact details */}
      {step === 6 && (
        <div>
          <h2 className="mb-5 font-display text-xl font-black text-charcoal sm:text-2xl">
            Your contact details
          </h2>
          {/* Honeypot */}
          <input
            type="text"
            name="website"
            aria-hidden
            tabIndex={-1}
            className="absolute -left-[9999px] opacity-0"
            autoComplete="off"
          />
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="s6-name" className="mb-1 block text-[13px] font-bold text-charcoal">
                Name{' '}
                <span aria-hidden className="text-scotch">
                  *
                </span>
              </label>
              <input
                id="s6-name"
                type="text"
                autoComplete="name"
                value={state.step6Name ?? ''}
                onChange={(e) => {
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n.name;
                    return n;
                  });
                  update({ step6Name: e.target.value });
                }}
                placeholder="Grace Okafor"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 's6-name-err' : undefined}
                className={`h-12 w-full rounded-xl border px-4 text-[15px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30 ${
                  errors.name ? 'border-scotch bg-scotch/5' : 'border-cream-deep bg-white'
                }`}
              />
              <FieldError id="s6-name-err" message={errors.name} />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="s6-email" className="mb-1 block text-[13px] font-bold text-charcoal">
                Email{' '}
                <span aria-hidden className="text-scotch">
                  *
                </span>
              </label>
              <input
                id="s6-email"
                type="email"
                autoComplete="email"
                value={state.step6Email ?? ''}
                onChange={(e) => {
                  setErrors((prev) => {
                    const n = { ...prev };
                    delete n.email;
                    return n;
                  });
                  update({ step6Email: e.target.value });
                }}
                placeholder="grace@example.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 's6-email-err' : undefined}
                className={`h-12 w-full rounded-xl border px-4 text-[15px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30 ${
                  errors.email ? 'border-scotch bg-scotch/5' : 'border-cream-deep bg-white'
                }`}
              />
              <FieldError id="s6-email-err" message={errors.email} />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="s6-phone" className="mb-1 block text-[13px] font-bold text-charcoal">
                Phone <span className="font-medium text-charcoal-light">(optional)</span>
              </label>
              <input
                id="s6-phone"
                type="tel"
                autoComplete="tel"
                value={state.step6Phone ?? ''}
                onChange={(e) => update({ step6Phone: e.target.value })}
                placeholder="+44 7700 900000"
                className="h-12 w-full rounded-xl border border-cream-deep bg-white px-4 text-[15px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30"
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="s6-notes" className="mb-1 block text-[13px] font-bold text-charcoal">
                Anything else we should know?{' '}
                <span className="font-medium text-charcoal-light">(optional)</span>
              </label>
              <textarea
                id="s6-notes"
                rows={3}
                value={state.step6Notes ?? ''}
                onChange={(e) => update({ step6Notes: e.target.value })}
                placeholder="Dietary requirements, allergies, specific dishes, delivery notes..."
                className="w-full rounded-xl border border-cream-deep bg-white px-4 py-3 text-[15px] font-medium text-charcoal outline-none placeholder:text-charcoal-light focus:ring-2 focus:ring-brand/30"
              />
            </div>

            {/* How did you hear about us */}
            <div>
              <label
                htmlFor="s6-hear-about-us"
                className="mb-1 block text-[13px] font-bold text-charcoal"
              >
                How did you hear about us?{' '}
                <span className="font-medium text-charcoal-light">(optional)</span>
              </label>
              <select
                id="s6-hear-about-us"
                value={state.step6HearAboutUs ?? ''}
                onChange={(e) => update({ step6HearAboutUs: e.target.value || undefined })}
                className="h-12 w-full rounded-xl border border-cream-deep bg-white px-4 text-[15px] font-medium text-charcoal outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="">Select one</option>
                {HEAR_ABOUT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => goToStep(step - 1)}
            className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-cream-deep bg-white px-5 py-3 text-sm font-bold text-charcoal transition-colors hover:bg-cream"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
        ) : (
          <div />
        )}

        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={tryAdvance}
            className="touch-target inline-flex items-center rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-dark"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="touch-target inline-flex items-center rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {submitting ? 'Sending...' : 'Request catering help'}
          </button>
        )}
      </div>

      {serverError && (
        <p role="alert" className="mt-4 text-[13px] font-medium text-scotch">
          {serverError}
        </p>
      )}
    </div>
  );
}
