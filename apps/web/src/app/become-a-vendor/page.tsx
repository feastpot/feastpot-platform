'use client';

import { ArrowRight, Check, CircleAlert, ImagePlus, Loader2, Mail, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RateRow } from '@feastpot/ui';
import { RateCard } from '@feastpot/ui';
import { apiRequest, ApiError } from '@/lib/api/client';
import { useTrackEvent } from '@/hooks/use-track-event';
import { getOrCreateAnonId } from '@/lib/analytics/anon-id';
import { OCCASIONS, OCCASION_SLUGS } from '@/lib/occasions';
import { EarningsCalculator } from './earnings-calculator';

const CUISINES = [
  'Nigerian',
  'Ghanaian',
  'Jamaican',
  'Trinidadian',
  'Guyanese',
  'Congolese',
  'Somali',
  'Ethiopian',
  'Eritrean',
  'Kenyan',
  'Ugandan',
  'South African',
  'West African',
  'East African',
  'Caribbean',
  'Other',
];
const STEP_NAMES = [
  'phase_2_business_name',
  'phase_2_cuisines',
  'phase_2_menu',
  'phase_2_occasions',
] as const;
type CurrentStep =
  | 'phase_2_business_name'
  | 'phase_2_cuisines'
  | 'phase_2_menu'
  | 'phase_2_occasions'
  | 'phase_2_review'
  | 'submitted';
type PhaseTwoScreen =
  | 'phase_2_business_name'
  | 'phase_2_cuisines'
  | 'phase_2_menu'
  | 'phase_2_occasions'
  | 'review';
type AbandonmentField =
  | 'first_name'
  | 'email'
  | 'mobile_number'
  | 'postcode'
  | 'kitchen_name'
  | 'cuisine_types'
  | 'menu_photo'
  | 'menu_build_from_photo'
  | 'occasion_slugs';
type AbandonmentPhase = 'phase_1' | 'phase_2';
type AbandonmentStep = 'contact_details' | Exclude<PhaseTwoScreen, 'review'> | 'review';
type Draft = {
  id?: string;
  firstName: string;
  email: string;
  mobileNumber: string;
  postcode: string;
  phone?: string;
  kitchenName: string;
  cuisineTypes: string[];
  occasionSlugs: string[];
  menuPhotoUrl?: string;
  menuBuildFromPhoto: boolean;
  currentStep: CurrentStep;
};
type DraftResponse = Omit<Draft, 'mobileNumber'> & {
  mobileNumber?: string;
  phone?: string;
  resumeToken?: string;
};
const emptyDraft: Draft = {
  firstName: '',
  email: '',
  mobileNumber: '',
  postcode: '',
  kitchenName: '',
  cuisineTypes: [],
  occasionSlugs: [],
  menuBuildFromPhoto: false,
  currentStep: 'phase_2_business_name',
};

const pct = (value: number) => (value % 1 === 0 ? String(value) : value.toFixed(1));
const liveRate = (rates: RateRow[], key: string) =>
  rates.find((rate) => rate.key === key && rate.status === 'LIVE')?.rateValue;
const occasionOptions = OCCASION_SLUGS.map((slug) => ({
  slug,
  label: OCCASIONS[slug].h1.split(',')[0] ?? slug,
}));

function RateIntroduction({ rates, error }: { rates: RateRow[]; error: string }) {
  const referred = liveRate(rates, 'referred_commission');
  const standard = liveRate(rates, 'standard_commission');
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl bg-[#dcebdc] p-5">
        <p className="text-xs font-black uppercase tracking-widest text-[#28734a]">
          Your customers
        </p>
        <p className="mt-2 font-display text-4xl font-black">
          {referred == null ? 'Not available' : `${pct(referred)}%`}
        </p>
        <p className="mt-1 text-sm text-[#4f5a4e]">live referred commission</p>
        {referred === 0 && (
          <p className="mt-3 text-sm leading-relaxed text-[#354635]">
            You pay Feastpot nothing on customers you bring yourself. Customers pay the separately
            displayed service fee.
          </p>
        )}
      </div>
      <div className="rounded-2xl bg-white p-5">
        <p className="text-xs font-black uppercase tracking-widest text-[#b84f32]">
          Customers we find
        </p>
        <p className="mt-2 font-display text-4xl font-black">
          {standard == null ? 'Not available' : `${pct(standard)}%`}
        </p>
        <p className="mt-1 text-sm text-[#6c665d]">live marketplace rate</p>
      </div>
      <div className="rounded-2xl bg-[#26231f] p-5 text-white">
        <p className="text-xs font-black uppercase tracking-widest text-[#f2c879]">
          Simple from day one
        </p>
        <p className="mt-2 font-display text-3xl font-black">No upfront fee</p>
        <p className="mt-1 text-sm text-white/70">No monthly fee. Weekly payouts.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#b84f32] sm:col-span-3">
          {error}
        </p>
      )}
    </div>
  );
}

function TogglePills({
  options,
  selected,
  onToggle,
  prefix,
  onFocus,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  prefix: string;
  onFocus?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            data-testid={`${prefix}-${option.value}`}
            aria-pressed={active}
            onFocus={onFocus}
            onClick={() => onToggle(option.value)}
            className={`rounded-full border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${active ? 'border-[#b84f32] bg-[#fff0ea] text-[#9a3f29]' : 'border-[#e2d8c9] bg-white hover:border-[#b84f32]'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function StorefrontPreview({ draft, localImage }: { draft: Draft; localImage: string }) {
  const image = localImage || draft.menuPhotoUrl;
  return (
    <aside
      aria-label="Live storefront preview"
      className="rounded-3xl bg-[#26231f] p-5 text-white shadow-xl"
    >
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-[#f2c879]">
        <Sparkles className="h-4 w-4" /> Live storefront preview
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl bg-[#fffaf1] text-[#26231f]">
        {image ? (
          <img src={image} alt="Your uploaded menu" className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-36 items-center justify-center bg-[#ead6b8] text-sm text-[#6c665d]">
            Your menu photo appears here
          </div>
        )}
        <div className="p-4">
          <h3 className="font-display text-2xl font-black">
            {draft.kitchenName || 'Your kitchen name'}
          </h3>
          <p className="mt-1 text-sm text-[#6c665d]">
            {draft.cuisineTypes.length ? draft.cuisineTypes.join(' · ') : 'Your cuisines'}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {draft.occasionSlugs.length ? (
              draft.occasionSlugs.map((slug) => (
                <span
                  key={slug}
                  className="rounded-full bg-[#f4eadb] px-2.5 py-1 text-xs font-semibold"
                >
                  {occasionOptions.find((item) => item.slug === slug)?.label}
                </span>
              ))
            ) : (
              <span className="text-xs text-[#8d8377]">Your occasions</span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SaveStatus({ state }: { state: 'Saved' | 'Saving' | 'Error' }) {
  return (
    <p aria-live="polite" className="text-sm text-[#6c665d]">
      {state === 'Saving'
        ? 'Saving your progress…'
        : state === 'Error'
          ? 'Could not save this change. Try again.'
          : 'Saved'}
    </p>
  );
}

function PhaseOne({
  draft,
  setDraft,
  onComplete,
  error,
  busy,
  onFieldFocus,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  onComplete: () => void;
  error: string;
  busy: boolean;
  onFieldFocus: (field: AbandonmentField) => void;
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const validate = () => {
    const next: Record<string, string> = {};
    if (draft.firstName.trim().length < 2) next.firstName = 'Enter your first name.';
    if (!draft.email.includes('@')) next.email = 'Enter a valid email address.';
    if (draft.mobileNumber.replace(/\D/g, '').length < 7)
      next.mobileNumber = 'Enter a valid mobile number.';
    if (draft.postcode.trim().length < 2) next.postcode = 'Enter your postcode.';
    setFieldErrors(next);
    return !Object.keys(next).length;
  };
  const input = (key: keyof Draft, label: string, type = 'text', autoComplete?: string) => {
    const id = `phase-one-${key}`;
    return (
      <label htmlFor={id} className="block font-bold">
        {label}
        <input
          id={id}
          data-testid={`input-${key}`}
          type={type}
          inputMode={key === 'mobileNumber' ? 'tel' : undefined}
          value={String(draft[key] || '')}
          onChange={(event) =>
            setDraft({
              ...draft,
              [key]: key === 'postcode' ? event.target.value.toUpperCase() : event.target.value,
            })
          }
          onFocus={() => onFieldFocus(key as AbandonmentField)}
          aria-invalid={Boolean(fieldErrors[key])}
          aria-describedby={fieldErrors[key] ? `${id}-error` : undefined}
          autoComplete={autoComplete}
          className="mt-2 w-full rounded-xl border-2 border-[#e2d8c9] p-4 focus:border-[#b84f32] focus:outline-none"
        />
        {fieldErrors[key] && (
          <span id={`${id}-error`} className="mt-1 block text-sm font-normal text-[#9a3f29]">
            {fieldErrors[key]}
          </span>
        )}
      </label>
    );
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (validate()) onComplete();
      }}
      className="space-y-5"
    >
      <h2 className="font-display text-4xl font-black">Let’s get your kitchen on the map.</h2>
      <p className="text-[#6c665d]">
        This creates your application immediately. We save your progress and email a resume link.
      </p>
      {error && (
        <div role="alert" className="flex gap-2 rounded-xl bg-[#fff0ea] p-4 text-sm text-[#9a3f29]">
          <CircleAlert className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}
      {input('firstName', 'First name', 'text', 'given-name')}
      {input('email', 'Email', 'email', 'email')}
      {input('mobileNumber', 'Mobile number', 'tel', 'tel')}
      {input('postcode', 'Postcode', 'text', 'postal-code')}
      <p className="flex gap-2 text-sm text-[#6c665d]">
        <Mail className="h-5 w-5 shrink-0 text-[#b84f32]" />
        Progress is saved and an email resume link is sent.
      </p>
      <p className="text-sm text-[#6c665d]">
        You can apply as an individual; company registration and an FHRS number are not required to
        start.
      </p>
      <button
        disabled={busy}
        data-testid="button-phase-one"
        className="w-full rounded-xl bg-[#b84f32] p-4 font-bold text-white disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : (
          <>
            Continue to phase 2 <ArrowRight className="ml-2 inline h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}

function PhaseTwo({
  draft,
  update,
  saveStatus,
  error,
  localImage,
  upload,
  onSubmit,
  busy,
  screen,
  setScreen,
  onFieldFocus,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>, destination?: CurrentStep, immediate?: boolean) => void;
  saveStatus: 'Saved' | 'Saving' | 'Error';
  error: string;
  localImage: string;
  upload: (file: File) => void;
  onSubmit: () => void;
  busy: boolean;
  screen: PhaseTwoScreen;
  setScreen: (screen: PhaseTwoScreen) => void;
  onFieldFocus: (field: AbandonmentField) => void;
}) {
  const [fieldError, setFieldError] = useState('');
  const [menuError, setMenuError] = useState('');
  const questionRef = useRef<HTMLInputElement>(null);
  const screenIndex =
    screen === 'review' ? 4 : STEP_NAMES.indexOf(screen as (typeof STEP_NAMES)[number]);
  useEffect(() => {
    questionRef.current?.focus();
  }, [screen]);
  const next = async (
    destination: Exclude<CurrentStep, 'phase_2_review' | 'submitted'>,
    valid: boolean,
    message: string,
  ) => {
    if (!valid) {
      setFieldError(message);
      return;
    }
    setFieldError('');
    update({}, destination, true);
    setScreen(destination);
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#b84f32]">
            Phase 2 of 2
          </p>
          <p className="mt-1 text-sm text-[#6c665d]">Step {screenIndex + 1} of 5</p>
        </div>
        <SaveStatus state={saveStatus} />
      </div>
      <div className="h-2 rounded-full bg-[#eadfce]">
        <div
          className="h-2 rounded-full bg-[#b84f32] transition-all"
          style={{ width: `${((screenIndex + 1) / 5) * 100}%` }}
        />
      </div>
      {error && (
        <div role="alert" className="flex gap-2 rounded-xl bg-[#fff0ea] p-4 text-sm text-[#9a3f29]">
          <CircleAlert className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}
      {fieldError && (
        <p role="alert" className="text-sm text-[#9a3f29]">
          {fieldError}
        </p>
      )}
      {screen === 'phase_2_business_name' && (
        <Question
          title="What should customers call your kitchen?"
          hint="This is the name on your storefront."
        >
          <label htmlFor="kitchen-name" className="block font-bold">
            Kitchen or business name
            <input
              id="kitchen-name"
              ref={questionRef}
              data-testid="input-kitchen-name"
              value={draft.kitchenName}
              onChange={(event) => update({ kitchenName: event.target.value })}
              onFocus={() => onFieldFocus('kitchen_name')}
              aria-describedby={fieldError ? 'business-error' : undefined}
              className="mt-2 w-full rounded-xl border-2 border-[#e2d8c9] p-4"
            />
            {fieldError && (
              <span id="business-error" className="mt-1 block text-sm font-normal text-[#9a3f29]">
                {fieldError}
              </span>
            )}
          </label>
          <NextButton
            onClick={() =>
              next(
                'phase_2_cuisines',
                draft.kitchenName.trim().length >= 2,
                'Enter your kitchen or business name.',
              )
            }
          />
        </Question>
      )}
      {screen === 'phase_2_cuisines' && (
        <Question title="What do you cook?" hint="Choose every cuisine that belongs on your menu.">
          <TogglePills
            prefix="button-cuisine"
            options={CUISINES.map((value) => ({ value, label: value }))}
            selected={draft.cuisineTypes}
            onFocus={() => onFieldFocus('cuisine_types')}
            onToggle={(value) =>
              update(
                {
                  cuisineTypes: draft.cuisineTypes.includes(value)
                    ? draft.cuisineTypes.filter((item) => item !== value)
                    : [...draft.cuisineTypes, value],
                },
                undefined,
                true,
              )
            }
          />
          <NextButton
            onClick={() =>
              next('phase_2_menu', draft.cuisineTypes.length > 0, 'Choose at least one cuisine.')
            }
          />
        </Question>
      )}
      {screen === 'phase_2_menu' && (
        <Question
          title="Show us one menu photo."
          hint="Send us your menu however you have it. We will type it up. A screenshot or clear photo is enough."
        >
          <label className="flex min-h-36 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#d8c8b5] bg-[#fffaf1] p-5 text-center">
            <ImagePlus className="text-[#b84f32]" />
            <span className="text-sm font-semibold">
              {localImage || draft.menuPhotoUrl ? 'Replace menu photo' : 'Upload your menu photo'}
              <small className="mt-1 block font-normal text-[#6c665d]">
                JPEG, PNG or WebP, max 5MB
              </small>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              data-testid="input-menu-photo"
              className="sr-only"
              onFocus={() => onFieldFocus('menu_photo')}
              onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])}
            />
          </label>
          <label className="mt-4 flex gap-3 rounded-xl bg-[#f4eadb] p-4 text-sm font-semibold">
            <input
              type="checkbox"
              checked={draft.menuBuildFromPhoto}
              onFocus={() => onFieldFocus('menu_build_from_photo')}
              onChange={(event) =>
                update({ menuBuildFromPhoto: event.target.checked }, undefined, true)
              }
            />
            I do not have a formatted menu: build it from my photo
          </label>
          {menuError && <p className="text-sm text-[#9a3f29]">{menuError}</p>}
          <NextButton
            onClick={() => {
              const valid = Boolean(localImage || draft.menuPhotoUrl);
              setMenuError(valid ? '' : 'Upload a menu photo before continuing.');
              void next('phase_2_occasions', valid, 'Upload a menu photo before continuing.');
            }}
          />
        </Question>
      )}
      {screen === 'phase_2_occasions' && (
        <Question
          title="What do you make food for?"
          hint="This helps the right customers find your storefront."
        >
          <TogglePills
            prefix="button-occasion"
            options={occasionOptions.map(({ slug, label }) => ({ value: slug, label }))}
            selected={draft.occasionSlugs}
            onFocus={() => onFieldFocus('occasion_slugs')}
            onToggle={(value) =>
              update(
                {
                  occasionSlugs: draft.occasionSlugs.includes(value)
                    ? draft.occasionSlugs.filter((item) => item !== value)
                    : [...draft.occasionSlugs, value],
                },
                undefined,
                true,
              )
            }
          />
          <NextButton
            onClick={() => {
              if (!draft.occasionSlugs.length) {
                setFieldError('Choose at least one occasion.');
                return;
              }
              setFieldError('');
              update({}, 'phase_2_review', true);
              setScreen('review');
            }}
            label="Review storefront"
          />
        </Question>
      )}
      {screen === 'review' && (
        <Question
          title="Ready to put your storefront forward?"
          hint="Have a look, then send it to Feastpot for review."
        >
          <StorefrontPreview draft={draft} localImage={localImage} />
          <button
            type="button"
            disabled={busy}
            data-testid="button-submit-application"
            onClick={onSubmit}
            className="w-full rounded-xl bg-[#b84f32] p-4 font-bold text-white disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="mx-auto animate-spin" />
            ) : (
              <>
                Send my application <ArrowRight className="ml-2 inline h-4 w-4" />
              </>
            )}
          </button>
        </Question>
      )}
      {screen !== 'review' && (
        <div className="mt-2">
          <StorefrontPreview draft={draft} localImage={localImage} />
        </div>
      )}
    </div>
  );
}

function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-4xl font-black">{title}</h2>
        <p className="mt-2 text-[#6c665d]">{hint}</p>
      </div>
      {children}
    </div>
  );
}
function NextButton({ onClick, label = 'Next' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      data-testid={`button-next-${label.toLowerCase().replaceAll(' ', '-')}`}
      onClick={onClick}
      className="w-full rounded-xl bg-[#b84f32] p-4 font-bold text-white"
    >
      {label} <ArrowRight className="ml-2 inline h-4 w-4" />
    </button>
  );
}

function ApplicationFlow({ track }: { track: ReturnType<typeof useTrackEvent> }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [token, setToken] = useState('');
  const [screen, setScreen] = useState<PhaseTwoScreen>('phase_2_business_name');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'Saved' | 'Saving' | 'Error'>('Saved');
  const [localImage, setLocalImage] = useState('');
  const [completed, setCompleted] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Promise<unknown> | null>(null);
  const queuedSaveRef = useRef<{
    patch: Partial<Draft>;
    destination: CurrentStep;
  } | null>(null);
  const saveFailedRef = useRef(false);
  const applyRef = useRef<HTMLElement>(null);
  const lastFieldRef = useRef<AbandonmentField>('first_name');
  const abandonmentSentRef = useRef(false);
  const milestoneRef = useRef({ phaseTwoStarted: false });
  const identityHeaders = () => {
    const sid = document.cookie.match(/(?:^|;\s*)fp_sid=([^;]+)/)?.[1];
    const ref = document.cookie.match(/(?:^|;\s*)fp_ref=([^;]+)/)?.[1];
    return {
      'X-Fp-Anon-Id': getOrCreateAnonId(),
      ...(ref ? { 'X-Fp-Ref': decodeURIComponent(ref) } : {}),
      ...(sid ? { 'X-Fp-Sid': decodeURIComponent(sid) } : {}),
    };
  };
  const noteField = (field: AbandonmentField) => {
    lastFieldRef.current = field;
  };
  useEffect(() => {
    const abandon = () => {
      if (document.visibilityState === 'hidden' || document.visibilityState === undefined) {
        if (abandonmentSentRef.current) return;
        abandonmentSentRef.current = true;
        track('application_field_abandoned', {
          field: lastFieldRef.current,
          phase: (token ? 'phase_2' : 'phase_1') satisfies AbandonmentPhase,
          step: (token ? screen : 'contact_details') satisfies AbandonmentStep,
        });
      }
    };
    const becameVisible = () => {
      if (document.visibilityState === 'visible') abandonmentSentRef.current = false;
    };
    window.addEventListener('pagehide', abandon);
    document.addEventListener('visibilitychange', abandon);
    document.addEventListener('visibilitychange', becameVisible);
    return () => {
      window.removeEventListener('pagehide', abandon);
      document.removeEventListener('visibilitychange', abandon);
      document.removeEventListener('visibilitychange', becameVisible);
    };
  }, [screen, token, track]);

  const save = (patch: Partial<Draft>, destination: CurrentStep, immediate: boolean) => {
    const completePatch: Partial<Draft> = {
      kitchenName: patch.kitchenName ?? draft.kitchenName,
      cuisineTypes: patch.cuisineTypes ?? draft.cuisineTypes,
      occasionSlugs: patch.occasionSlugs ?? draft.occasionSlugs,
      menuBuildFromPhoto: patch.menuBuildFromPhoto ?? draft.menuBuildFromPhoto,
    };
    setDraft((current) => ({ ...current, ...completePatch, currentStep: destination }));
    if (!token) return Promise.resolve();
    setSaveStatus('Saving');
    saveFailedRef.current = false;
    const run = (payload: { patch: Partial<Draft>; destination: CurrentStep }) =>
      apiRequest<Draft>(`/vendors/application-drafts/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: identityHeaders(),
        body: { ...payload.patch, currentStep: payload.destination },
      })
        .then(() => setSaveStatus('Saved'))
        .catch(() => {
          saveFailedRef.current = true;
          setSaveStatus('Error');
        });
    const enqueue = (payload: { patch: Partial<Draft>; destination: CurrentStep }) => {
      const prior = pendingRef.current ?? Promise.resolve();
      pendingRef.current = prior.then(() => run(payload));
      return pendingRef.current;
    };

    if (immediate) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const queued = queuedSaveRef.current;
      queuedSaveRef.current = null;
      return enqueue({
        patch: { ...(queued?.patch ?? {}), ...completePatch },
        destination,
      });
    }

    queuedSaveRef.current = {
      patch: { ...(queuedSaveRef.current?.patch ?? {}), ...completePatch },
      destination,
    };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const queued = queuedSaveRef.current;
      queuedSaveRef.current = null;
      debounceRef.current = null;
      if (queued) void enqueue(queued);
    }, 350);
    return Promise.resolve();
  };
  const flushPendingSave = async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    const queued = queuedSaveRef.current;
    queuedSaveRef.current = null;
    if (queued) {
      const prior = pendingRef.current ?? Promise.resolve();
      pendingRef.current = prior.then(() =>
        apiRequest<Draft>(`/vendors/application-drafts/${encodeURIComponent(token)}`, {
          method: 'PATCH',
          headers: identityHeaders(),
          body: { ...queued.patch, currentStep: queued.destination },
        })
          .then(() => {
            saveFailedRef.current = false;
            setSaveStatus('Saved');
          })
          .catch(() => {
            saveFailedRef.current = true;
            setSaveStatus('Error');
          }),
      );
    }
    await pendingRef.current;
    if (saveFailedRef.current) throw new Error('save');
  };
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (localImage) URL.revokeObjectURL(localImage);
    },
    [localImage],
  );
  useEffect(() => {
    const resume = new URLSearchParams(window.location.search).get('resume');
    if (!resume) return;
    setToken(resume);
    if (!milestoneRef.current.phaseTwoStarted) {
      milestoneRef.current.phaseTwoStarted = true;
      track('application_phase_2_started');
    }
    setSaveStatus('Saving');
    apiRequest<DraftResponse>(`/vendors/application-drafts/${encodeURIComponent(resume)}`, {
      headers: identityHeaders(),
    })
      .then((response) => {
        const restored: Draft = {
          ...emptyDraft,
          ...response,
          mobileNumber: response.mobileNumber || response.phone || '',
          currentStep: response.currentStep,
        };
        setDraft(restored);
        if (restored.currentStep === 'submitted') setCompleted(true);
        else setScreen(restored.currentStep === 'phase_2_review' ? 'review' : restored.currentStep);
        setSaveStatus('Saved');
      })
      .catch(() =>
        setError(
          'This save link has expired. Start a new application and we will save your progress again.',
        ),
      );
  }, [track]);
  const createDraft = async () => {
    setError('');
    setBusy(true);
    try {
      const response = await apiRequest<DraftResponse & { resumeToken: string }>(
        '/vendors/application-drafts',
        {
          method: 'POST',
          body: {
            firstName: draft.firstName.trim(),
            email: draft.email.trim(),
            mobileNumber: draft.mobileNumber.trim(),
            postcode: draft.postcode.trim().toUpperCase(),
          },
          headers: identityHeaders(),
        },
      );
      const resumeToken = response.resumeToken;
      setToken(resumeToken);
      setDraft((current) => ({ ...current, ...response, currentStep: 'phase_2_business_name' }));
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}?resume=${encodeURIComponent(resumeToken)}`,
      );
      if (!milestoneRef.current.phaseTwoStarted) {
        milestoneRef.current.phaseTwoStarted = true;
        track('application_phase_2_started');
      }
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'We could not save that yet. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError('Use a JPEG, PNG or WebP image under 5MB.');
      return;
    }
    if (localImage) URL.revokeObjectURL(localImage);
    const objectUrl = URL.createObjectURL(file);
    setLocalImage(objectUrl);
    setSaveStatus('Saving');
    setError('');
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await apiRequest<Draft>(
        `/vendors/application-drafts/${encodeURIComponent(token)}/menu-photo`,
        { method: 'POST', body: form, headers: identityHeaders() },
      );
      setDraft((current) => ({ ...current, ...response }));
      track('application_menu_uploaded', { method: 'photo' });
      setSaveStatus('Saved');
    } catch {
      setSaveStatus('Error');
      setError('That photo did not upload. Try another image.');
    }
  };
  const submit = async () => {
    if (!(localImage || draft.menuPhotoUrl) || !draft.occasionSlugs.length) {
      setError('Add your menu photo and one occasion before sending.');
      return;
    }
    setBusy(true);
    try {
      await flushPendingSave();
      await apiRequest(`/vendors/application-drafts/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: identityHeaders(),
      });
      setDraft((current) => ({ ...current, currentStep: 'submitted' }));
      setCompleted(true);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'We could not submit yet. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  if (completed)
    return (
      <div className="rounded-3xl bg-[#fffaf1] p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f2e8]">
          <Check className="text-[#28734a]" />
        </div>
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#28734a]">
          Application sent
        </p>
        <h2 className="mt-3 font-display text-4xl font-black">Your storefront is taking shape.</h2>
        <p className="mt-4 leading-relaxed text-[#6c665d]">
          We have your details. We will review them and email you with the next step.
        </p>
      </div>
    );
  const phaseOne = (
    <PhaseOne
      draft={draft}
      setDraft={setDraft}
      onComplete={createDraft}
      error={error}
      busy={busy}
      onFieldFocus={noteField}
    />
  );
  return (
    <section ref={applyRef} className="border-t border-[#eadfce] bg-white px-5 py-12">
      <div className="mx-auto max-w-xl">
        {!token ? (
          <>
            <p className="mb-5 text-xs font-black uppercase tracking-[.2em] text-[#b84f32]">
              Phase 1 of 2
            </p>
            {phaseOne}
          </>
        ) : (
          <PhaseTwo
            draft={draft}
            update={(patch, destination, immediate) => {
              void save(patch, destination || draft.currentStep, Boolean(immediate));
            }}
            saveStatus={saveStatus}
            error={error}
            localImage={localImage}
            upload={upload}
            onSubmit={submit}
            busy={busy}
            screen={screen}
            setScreen={setScreen}
            onFieldFocus={noteField}
          />
        )}
      </div>
    </section>
  );
}

export default function BecomeAVendorPage() {
  const track = useTrackEvent();
  const [rates, setRates] = useState<RateRow[]>([]);
  const [ratesError, setRatesError] = useState('');
  const [open, setOpen] = useState(false);
  const startedRef = useRef(false);
  const landedRef = useRef(false);
  const calculatorReady =
    !ratesError &&
    [
      'referred_commission',
      'standard_commission',
      'repeat_commission',
      'customer_service_fee',
    ].every((key) => liveRate(rates, key) != null);
  useEffect(() => {
    if (!landedRef.current) {
      landedRef.current = true;
      track('become_a_vendor_landed');
    }
    apiRequest<RateRow[]>('/terms/rate-schedule')
      .then(setRates)
      .catch(() =>
        setRatesError(
          'Current rates could not be loaded. Rate details are hidden until they are available.',
        ),
      );
    if (new URLSearchParams(window.location.search).has('resume')) {
      setOpen(true);
      if (!startedRef.current) {
        startedRef.current = true;
        track('application_phase_1_started');
      }
    }
  }, [track]);
  const begin = () => {
    setOpen(true);
    if (!startedRef.current) {
      startedRef.current = true;
      track('application_phase_1_started');
    }
    setTimeout(
      () => document.querySelector<HTMLElement>('[data-testid="input-firstName"]')?.focus(),
      100,
    );
  };
  return (
    <main className="min-h-screen bg-[#fffaf1] text-[#26231f]">
      <nav className="sticky top-0 z-20 border-b border-[#eadfce] bg-[#fffaf1]/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" aria-label="Feastpot home">
            <Image
              src="/images/feastpot-logo.png"
              alt="Feastpot"
              width={190}
              height={60}
              className="h-10 w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={begin}
            className="rounded-xl bg-[#b84f32] px-4 py-2.5 text-sm font-bold text-white"
          >
            Apply to sell
          </button>
        </div>
      </nav>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-20">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#b84f32]">
            For cooks with a following
          </p>
          <h1 className="mt-3 font-display text-5xl font-black leading-[.98] sm:text-6xl">
            Make your kitchen
            <br />
            <span className="text-[#b84f32]">a storefront.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#6c665d]">
            Keep your customers, lose the admin. Feastpot handles card payments, order books and
            weekly payouts while you cook the food people already love.
          </p>
          <button
            type="button"
            onClick={begin}
            className="mt-7 rounded-xl bg-[#b84f32] px-6 py-4 font-bold text-white"
          >
            Start your application <ArrowRight className="ml-2 inline h-4 w-4" />
          </button>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] bg-[#ead6b8] shadow-xl">
          <Image
            src="/images/vendor-hero-food.png"
            alt="A colourful spread prepared by a Feastpot cook"
            width={700}
            height={620}
            className="h-full min-h-[340px] w-full object-cover"
            priority
          />
        </div>
      </section>
      <section id="numbers" className="border-y border-[#eadfce] bg-[#f4eadb] px-5 py-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-black">The simple version</h2>
          <RateIntroduction rates={rates} error={ratesError} />
          <RateCard
            rates={rates}
            loading={!rates.length && !ratesError}
            error={ratesError || undefined}
            className="mt-7"
          />
          {calculatorReady ? (
            <EarningsCalculator rates={rates} />
          ) : (
            <p className="mt-8 rounded-2xl bg-white p-5 text-sm text-[#6c665d]">
              The earnings calculator will appear when the current rate schedule is available.
            </p>
          )}
        </div>
      </section>
      {open ? (
        <ApplicationFlow track={track} />
      ) : (
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-3xl font-black">
            A short application, then a real storefront
          </h2>
          <p className="mt-3 max-w-xl text-[#6c665d]">
            Two phases, five clear questions. Your progress is saved as you go, and we email a
            resume link so you never start over.
          </p>
          <p className="mt-3 max-w-xl font-semibold text-[#4f493f]">
            Send us your menu however you have it. We will type it up, and you can review the draft
            before anything is published.
          </p>
          <button
            type="button"
            onClick={begin}
            className="mt-6 rounded-xl bg-[#b84f32] px-6 py-4 font-bold text-white"
          >
            Start in two minutes <ArrowRight className="ml-2 inline h-4 w-4" />
          </button>
        </section>
      )}
    </main>
  );
}
