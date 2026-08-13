'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ImageOff,
  Info,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@feastpot/ui';

import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import {
  useLiveMenuItems,
  useUpdateVendorProfile,
  useUploadVendorImage,
  useVendorProfile,
  type LiveMenuItem,
} from '@/hooks/use-vendor-profile';

// ---- constants ----

const SOCIAL_KEYS = ['website', 'instagram', 'tiktok', 'facebook', 'youtube'] as const;
type SocialKey = (typeof SOCIAL_KEYS)[number];

const SOCIAL_LABELS: Record<SocialKey, string> = {
  website: 'Website',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

const SOCIAL_PLACEHOLDERS: Record<SocialKey, string> = {
  website: 'https://mamanskitchen.co.uk',
  instagram: '@mamanskitchen or full URL',
  tiktok: '@mamanskitchen or full URL',
  facebook: '@mamanskitchen or full URL',
  youtube: '@mamanskitchen or full URL',
};

const SOCIAL_HANDLE_BASE: Partial<Record<SocialKey, (h: string) => string>> = {
  instagram: (h) => `https://www.instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
};

const MAX_SPECIALITIES = 12;
const MAX_FEATURED = 6;
const DESC_SOFT_MAX = 160;
const STORY_SOFT_MAX = 1000;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---- helpers ----

function normaliseSocialUrl(key: SocialKey, raw: string): string {
  const v = raw.trim();
  if (!v || key === 'website') return v;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  const handle = v.replace(/^@/, '').replace(/\s+/g, '');
  return SOCIAL_HANDLE_BASE[key]?.(handle) ?? v;
}

function validateSocialUrl(key: SocialKey, url: string): string | null {
  if (!url) return null;
  if (key === 'website' && !/^https?:\/\//i.test(url)) {
    return 'Enter a full https:// URL for your website';
  }
  try {
    const p = new URL(url);
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return 'Must start with https://';
    if (!p.hostname.includes('.')) return 'Enter a valid URL';
  } catch {
    return 'Enter a valid URL';
  }
  return null;
}

/**
 * Split a string array that may contain legacy comma-separated values into
 * individual trimmed chips, deduplicating case-insensitively.
 * e.g. ["Nigerian, Ghanaian", "Caribbean"] -> ["Nigerian", "Ghanaian", "Caribbean"]
 */
function splitChips(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    for (const part of entry.split(',')) {
      const chip = part.trim();
      if (!chip) continue;
      const key = chip.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(chip);
      }
    }
  }
  return result;
}

function seedSocial(links: Record<string, string> | null): Record<SocialKey, string> {
  const s: Record<SocialKey, string> = {
    website: '', instagram: '', tiktok: '', facebook: '', youtube: '',
  };
  for (const k of SOCIAL_KEYS) {
    const v = links?.[k];
    if (typeof v === 'string') s[k] = v;
  }
  return s;
}

// ---- form state ----

interface FormState {
  businessName: string;
  slug: string;
  description: string;
  cuisineChips: string[];
  specialityChips: string[];
  featuredItemIds: string[];
  vendorStory: string;
  social: Record<SocialKey, string>;
}

const EMPTY: FormState = {
  businessName: '',
  slug: '',
  description: '',
  cuisineChips: [],
  specialityChips: [],
  featuredItemIds: [],
  vendorStory: '',
  social: { website: '', instagram: '', tiktok: '', facebook: '', youtube: '' },
};

// ---- main component ----

export function ProfileForm() {
  const { data: vendor, isLoading } = useVendorProfile();
  const update = useUpdateVendorProfile(vendor?.id);
  const upload = useUploadVendorImage(vendor?.id);
  const { data: liveItems = [] } = useLiveMenuItems(vendor?.id);
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [seeded, setSeeded] = useState(false);
  const [originalSlug, setOriginalSlug] = useState('');
  const [slugEditMode, setSlugEditMode] = useState(false);
  const [slugChangedThisSession, setSlugChangedThisSession] = useState(false);
  // Specialities that were silently dropped during migration (> MAX_SPECIALITIES).
  // Shown once as a dismissible notice so the vendor can decide what to keep.
  const [droppedSpecialities, setDroppedSpecialities] = useState<string[]>([]);

  // Seed form once on vendor load.
  const seedRef = useRef(false);
  if (vendor && !seedRef.current) {
    seedRef.current = true;
    Promise.resolve().then(() => {
      // Split any legacy comma-separated strings into individual chips.
      const allSpecialities = splitChips(vendor.specialities);
      const kept = allSpecialities.slice(0, MAX_SPECIALITIES);
      const dropped = allSpecialities.slice(MAX_SPECIALITIES);

      setForm({
        businessName: vendor.businessName,
        slug: vendor.slug,
        description: vendor.description ?? '',
        cuisineChips: splitChips(vendor.cuisines),
        specialityChips: kept,
        featuredItemIds: vendor.featuredDishes, // stored as menu-item IDs
        vendorStory: vendor.vendorStory ?? '',
        social: seedSocial(vendor.socialLinks),
      });
      setOriginalSlug(vendor.slug);
      if (dropped.length > 0) setDroppedSpecialities(dropped);
      setSeeded(true);
    });
  }

  // Auto-heal: filter out featured dish IDs no longer in the live items list.
  useEffect(() => {
    if (!seeded || liveItems.length === 0) return;
    const liveSet = new Set(liveItems.map((i) => i.id));
    setForm((s) => {
      const valid = s.featuredItemIds.filter((id) => liveSet.has(id));
      return valid.length !== s.featuredItemIds.length
        ? { ...s, featuredItemIds: valid }
        : s;
    });
  }, [seeded, liveItems]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;

    const slugTrimmed = form.slug.trim();
    if (!SLUG_RE.test(slugTrimmed)) {
      toast({
        title: 'Invalid URL slug',
        description: 'Use lowercase letters, digits and hyphens only. Example: mamans-kitchen',
        variant: 'destructive',
      });
      return;
    }

    // Normalise social handles to full URLs, then validate.
    const socialLinks: Record<string, string> = {};
    for (const k of SOCIAL_KEYS) {
      const raw = form.social[k].trim();
      if (!raw) continue;
      const url = normaliseSocialUrl(k, raw);
      const err = validateSocialUrl(k, url);
      if (err) {
        toast({ title: `${SOCIAL_LABELS[k]}: ${err}`, variant: 'destructive' });
        return;
      }
      socialLinks[k] = url;
    }

    const slugChanged = slugTrimmed !== originalSlug;

    try {
      await update.mutateAsync({
        businessName: form.businessName.trim(),
        slug: slugTrimmed,
        description: form.description.trim(),
        cuisineTypes: form.cuisineChips,
        specialities: form.specialityChips,
        featuredDishes: form.featuredItemIds,
        vendorStory: form.vendorStory.trim(),
        socialLinks,
      });

      setOriginalSlug(slugTrimmed);
      setSlugEditMode(false);
      if (slugChanged) setSlugChangedThisSession(true);

      toast({
        title: 'Profile saved',
        description: slugChanged
          ? 'Your URL slug has changed. Download fresh QR codes on the Share page.'
          : 'Customers see your changes next time the storefront refreshes.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isSlugTaken = msg.includes('SLUG_TAKEN') || msg.toLowerCase().includes('in use');
      toast({
        title: isSlugTaken ? 'That slug is already taken' : 'Could not save profile',
        description: isSlugTaken
          ? `Try "${slugTrimmed}-${vendor.businessName.toLowerCase().replace(/\s+/g, '-').slice(0, 12)}" instead.`
          : msg,
        variant: 'destructive',
      });
    }
  }

  if (isLoading && !seeded) {
    return <p className="text-sm text-mid">Loading profile...</p>;
  }
  if (!vendor) {
    return <p className="text-sm text-red-600">Could not load vendor profile.</p>;
  }

  const socialErrors = SOCIAL_KEYS.reduce<Partial<Record<SocialKey, string>>>((acc, k) => {
    const raw = form.social[k].trim();
    if (!raw) return acc;
    const url = normaliseSocialUrl(k, raw);
    const err = validateSocialUrl(k, url);
    if (err) acc[k] = err;
    return acc;
  }, {});

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Business profile</h1>
        <p className="mt-1 text-sm text-mid">
          The name, story and imagery customers see on your Feastpot page.
        </p>
      </header>

      <CompletenessCheck
        hasLogo={!!vendor.logoUrl}
        hasCover={!!vendor.coverImageUrl}
        hasDescription={form.description.trim().length > 0}
        hasCuisines={form.cuisineChips.length > 0}
        hasFeatured={form.featuredItemIds.length > 0}
        hasLiveItems={liveItems.length > 0}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-5">

          {/* Imagery */}
          <Section title="Imagery">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ImageSlot
                id="logo"
                label="Logo"
                hint="Square, at least 256x256 px"
                guidance="Your logo appears on your page, search results and order receipts. Without one, a grey placeholder shows instead."
                aspect="aspect-square"
                url={vendor.logoUrl}
                uploading={upload.isPending && upload.variables?.kind === 'logo'}
                onPick={(file) =>
                  upload.mutate({ kind: 'logo', file }, {
                    onSuccess: () => toast({ title: 'Logo updated' }),
                    onError: (err) =>
                      toast({ title: 'Logo upload failed', description: err instanceof Error ? err.message : '', variant: 'destructive' }),
                  })
                }
              />
              <ImageSlot
                id="cover"
                label="Cover photo"
                hint="Landscape, at least 1200x630 px"
                guidance="Kitchens with a cover photo attract noticeably more orders. Without one your page shows a plain colour block."
                aspect="aspect-[16/9]"
                url={vendor.coverImageUrl}
                uploading={upload.isPending && upload.variables?.kind === 'cover'}
                onPick={(file) =>
                  upload.mutate({ kind: 'cover', file }, {
                    onSuccess: () => toast({ title: 'Cover photo updated' }),
                    onError: (err) =>
                      toast({ title: 'Cover upload failed', description: err instanceof Error ? err.message : '', variant: 'destructive' }),
                  })
                }
              />
            </div>
          </Section>

          {/* Identity */}
          <Section title="Identity">
            <Field id="businessName" label="Business name">
              <TextInput
                id="businessName"
                value={form.businessName}
                onChange={(v) => setForm((s) => ({ ...s, businessName: v }))}
                required
                minLength={2}
                maxLength={255}
              />
            </Field>

            {/* Protected slug */}
            <Field id="slug" label="URL slug">
              {!slugEditMode ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-dark font-mono">
                    feastpot.co.uk/vendors/{form.slug}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSlugEditMode(true)}
                    className="shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-dark hover:bg-surface transition-colors"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800">Changing your URL slug</p>
                  <p className="text-xs text-amber-700">
                    Existing links will redirect to your new address automatically, so shared links
                    keep working. However, printed QR codes will show a redirect step, so consider
                    downloading fresh ones from the{' '}
                    <a href="/share" className="font-semibold underline underline-offset-2">
                      Share
                    </a>{' '}
                    page after saving.
                  </p>
                  <TextInput
                    id="slug"
                    value={form.slug}
                    onChange={(v) =>
                      setForm((s) => ({
                        ...s,
                        slug: v.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      }))
                    }
                    placeholder="mamans-kitchen-peckham"
                    required
                    minLength={3}
                    maxLength={64}
                  />
                  <Hint>Lowercase letters, numbers and hyphens only.</Hint>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((s) => ({ ...s, slug: originalSlug }));
                      setSlugEditMode(false);
                    }}
                    className="text-xs text-mid underline hover:text-dark"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </Field>

            <Field
              id="description"
              label="Short description"
              counter={`${form.description.length} / ${DESC_SOFT_MAX}`}
              counterOver={form.description.length > DESC_SOFT_MAX}
            >
              <Textarea
                id="description"
                value={form.description}
                maxLength={2000}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Authentic Nigerian and Caribbean home cooking from Peckham. Family recipes, party trays, and frozen packs for the week."
                rows={3}
                className="resize-none rounded-lg border-border bg-white text-sm text-dark focus-visible:ring-teal/30"
              />
              <Hint>Shown on search results and in link previews.</Hint>
            </Field>
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Live preview */}
          <Section title="Preview">
            <p className="text-xs text-mid mb-2">How your page header looks to customers.</p>
            <ProfilePreview
              businessName={form.businessName}
              description={form.description}
              cuisines={form.cuisineChips}
              logoUrl={vendor.logoUrl}
              coverImageUrl={vendor.coverImageUrl}
            />
          </Section>

          {/* Story */}
          <Section title="Your story">
            <Field
              id="vendorStory"
              label="Vendor story"
              counter={`${form.vendorStory.length} / ${STORY_SOFT_MAX}`}
              counterOver={form.vendorStory.length > STORY_SOFT_MAX}
            >
              <Textarea
                id="vendorStory"
                value={form.vendorStory}
                maxLength={4000}
                rows={7}
                onChange={(e) => setForm((s) => ({ ...s, vendorStory: e.target.value }))}
                placeholder="Where the recipes come from, who cooks, what makes your kitchen special."
                className="resize-none rounded-lg border-border bg-white text-sm text-dark focus-visible:ring-teal/30"
              />
              <Hint>Shown as a collapsible section on your public page.</Hint>
            </Field>
          </Section>

          {/* Social links */}
          <Section title="Social links">
            <p className="text-xs text-mid -mt-1">
              Enter a handle (e.g. @mamanskitchen) or a full URL. Your website must be a full URL.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SOCIAL_KEYS.map((k) => (
                <Field key={k} id={`social-${k}`} label={SOCIAL_LABELS[k]}>
                  <TextInput
                    id={`social-${k}`}
                    value={form.social[k]}
                    onChange={(v) =>
                      setForm((s) => ({ ...s, social: { ...s.social, [k]: v } }))
                    }
                    placeholder={SOCIAL_PLACEHOLDERS[k]}
                    inputMode="url"
                  />
                  {socialErrors[k] && (
                    <p className="text-[11px] text-destructive">{socialErrors[k]}</p>
                  )}
                </Field>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* What you cook - full width */}
      <Section title="What you cook">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cuisines */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-dark">Cuisines</label>
            <p className="text-[11px] text-mid">The food traditions you cook in.</p>
            <ChipInput
              chips={form.cuisineChips}
              onAdd={(chip) =>
                setForm((s) => ({
                  ...s,
                  cuisineChips: s.cuisineChips.includes(chip)
                    ? s.cuisineChips
                    : [...s.cuisineChips, chip],
                }))
              }
              onRemove={(i) =>
                setForm((s) => ({
                  ...s,
                  cuisineChips: s.cuisineChips.filter((_, idx) => idx !== i),
                }))
              }
              placeholder="e.g. Nigerian, Caribbean..."
            />
          </div>

          {/* Specialities */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-dark">
              Specialities
              <span className="ml-1 font-normal text-mid">
                ({form.specialityChips.length}/{MAX_SPECIALITIES})
              </span>
            </label>
            <p className="text-[11px] text-mid">What you are known for.</p>
            <ChipInput
              chips={form.specialityChips}
              onAdd={(chip) => {
                if (form.specialityChips.length >= MAX_SPECIALITIES) return;
                setForm((s) => ({
                  ...s,
                  specialityChips: s.specialityChips.includes(chip)
                    ? s.specialityChips
                    : [...s.specialityChips, chip],
                }));
              }}
              onRemove={(i) =>
                setForm((s) => ({
                  ...s,
                  specialityChips: s.specialityChips.filter((_, idx) => idx !== i),
                }))
              }
              maxItems={MAX_SPECIALITIES}
              placeholder="e.g. Jollof rice, Suya..."
            />
            {droppedSpecialities.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                <p className="flex-1">
                  Your profile had more than {MAX_SPECIALITIES} specialities. We kept the first{' '}
                  {MAX_SPECIALITIES} and removed:{' '}
                  <span className="font-semibold">{droppedSpecialities.join(', ')}</span>. Remove a
                  chip above to make room if you want to add any of these back.
                </p>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setDroppedSpecialities([])}
                  className="shrink-0 rounded p-0.5 hover:bg-amber-200"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            )}
          </div>

          {/* Featured dishes */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-dark" id="featured-dishes">
              Featured dishes
              <span className="ml-1 font-normal text-mid">
                ({form.featuredItemIds.length}/{MAX_FEATURED})
              </span>
            </label>
            <p className="text-[11px] text-mid">
              The two or three dishes you want at the top of your page.
            </p>
            <FeaturedDishPicker
              items={liveItems}
              selected={form.featuredItemIds}
              onChange={(ids) => setForm((s) => ({ ...s, featuredItemIds: ids }))}
              maxItems={MAX_FEATURED}
            />
          </div>
        </div>
      </Section>

      {/* Cross-reference note */}
      <div className="fp-card flex items-start gap-3 border border-teal-light bg-teal-light/30 px-4 py-3 text-xs text-dark">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
        <p>
          Service area, delivery radius, fees and minimum order live on the{' '}
          <a className="font-semibold text-teal underline-offset-2 hover:underline" href="/settings/delivery">
            Delivery
          </a>{' '}
          page. Opening days, prep lead time and daily caps live on the{' '}
          <a className="font-semibold text-teal underline-offset-2 hover:underline" href="/availability">
            Availability
          </a>{' '}
          page.
        </p>
      </div>

      {slugChangedThisSession && (
        <div className="fp-card flex items-start gap-3 border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Your URL slug changed.{' '}
            <a href="/share" className="font-semibold underline underline-offset-2">
              Download fresh QR codes
            </a>{' '}
            so they go directly to your new address.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={update.isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-teal px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60"
        >
          {update.isPending ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

// ---- sub-components ----

function CompletenessCheck({
  hasLogo, hasCover, hasDescription, hasCuisines, hasFeatured, hasLiveItems,
}: {
  hasLogo: boolean;
  hasCover: boolean;
  hasDescription: boolean;
  hasCuisines: boolean;
  hasFeatured: boolean;
  hasLiveItems: boolean;
}) {
  const gaps: { label: string; href: string; note: string }[] = [];
  if (!hasLogo)        gaps.push({ label: 'Add a logo',             href: '#logo',           note: 'customers associate your brand with your food' });
  if (!hasCover)       gaps.push({ label: 'Add a cover photo',      href: '#cover',          note: 'kitchens with a cover photo attract noticeably more orders' });
  if (!hasDescription) gaps.push({ label: 'Write a short description', href: '#description', note: 'shown on search results and link previews' });
  if (!hasCuisines)    gaps.push({ label: 'Add your cuisine types', href: '#cuisines',       note: 'customers filter search by cuisine' });
  if (!hasFeatured && hasLiveItems)
                       gaps.push({ label: 'Pick featured dishes',   href: '#featured-dishes',note: 'shown at the top of your public page' });

  if (gaps.length === 0) return null;

  return (
    <div className="fp-card border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-800">Complete your profile</p>
      <ul className="mt-2 space-y-1.5">
        {gaps.map((g) => (
          <li key={g.label} className="flex items-start gap-1.5 text-xs text-amber-700">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <span>
              <a href={g.href} className="font-semibold underline-offset-2 hover:underline">
                {g.label}
              </a>{' '}
              ({g.note})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChipInput({
  chips,
  onAdd,
  onRemove,
  maxItems,
  placeholder,
}: {
  chips: string[];
  onAdd: (chip: string) => void;
  onRemove: (index: number) => void;
  maxItems?: number;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = maxItems !== undefined && chips.length >= maxItems;

  function tryAdd(raw: string) {
    const value = raw.trim().replace(/,+$/, '').trim();
    if (!value || atMax) return;
    onAdd(value);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryAdd(input);
    } else if (e.key === ',') {
      e.preventDefault();
      tryAdd(input);
    } else if (e.key === 'Backspace' && input === '' && chips.length > 0) {
      onRemove(chips.length - 1);
    }
  }

  return (
    <div
      className="flex min-h-10 cursor-text flex-wrap gap-1.5 rounded-lg border border-border bg-white p-2 focus-within:border-teal focus-within:outline-none focus-within:ring-2 focus-within:ring-teal/30"
      onClick={() => inputRef.current?.focus()}
    >
      {chips.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark"
        >
          {chip}
          <button
            type="button"
            aria-label={`Remove ${chip}`}
            onClick={(e) => { e.stopPropagation(); onRemove(i); }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-teal/20"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      {atMax ? (
        <span className="self-center text-xs text-mid">
          Maximum {maxItems} reached. Remove a chip to add another.
        </span>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => tryAdd(input)}
          placeholder={chips.length === 0 ? placeholder : undefined}
          className="min-w-24 flex-1 bg-transparent text-sm text-dark outline-none placeholder:text-mid"
        />
      )}
    </div>
  );
}

function FeaturedDishPicker({
  items,
  selected,
  onChange,
  maxItems,
}: {
  items: LiveMenuItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  maxItems: number;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-4 text-center text-xs text-mid">
        You have no live menu items yet.{' '}
        <a href="/menu" className="font-semibold text-teal underline-offset-2 hover:underline">
          Add dishes to your menu
        </a>{' '}
        first, then come back to choose your featured ones.
      </div>
    );
  }

  const atMax = selected.length >= maxItems;

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-white p-2">
      {items.map((item) => {
        const isSelected = selected.includes(item.id);
        const disabled = !isSelected && atMax;
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (isSelected) {
                onChange(selected.filter((id) => id !== item.id));
              } else if (!atMax) {
                onChange([...selected, item.id]);
              }
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
              isSelected
                ? 'bg-teal/10 text-teal-dark'
                : disabled
                ? 'cursor-not-allowed text-mid opacity-50'
                : 'text-dark hover:bg-surface',
            )}
          >
            {item.imageUrls[0] ? (
              <Image
                src={item.imageUrls[0]}
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 rounded object-cover"
              />
            ) : (
              <span className="h-6 w-6 shrink-0 rounded bg-surface" />
            )}
            <span className="flex-1 truncate font-medium">{item.name}</span>
            {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-teal" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function ProfilePreview({
  businessName,
  description,
  cuisines,
  logoUrl,
  coverImageUrl,
}: {
  businessName: string;
  description: string;
  cuisines: string[];
  logoUrl: string | null;
  coverImageUrl: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      {/* Cover */}
      <div
        className={cn(
          'relative h-20',
          coverImageUrl ? '' : 'bg-gradient-to-br from-teal-light to-teal/30',
        )}
      >
        {coverImageUrl && (
          <Image src={coverImageUrl} alt="" fill className="object-cover" sizes="400px" />
        )}
        {/* Logo */}
        <div className="absolute -bottom-5 left-3 h-10 w-10 overflow-hidden rounded-full border-2 border-white bg-surface shadow-sm">
          {logoUrl ? (
            <Image src={logoUrl} alt="" fill className="object-cover" sizes="40px" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-surface">
              <ImageOff className="h-4 w-4 text-mid" aria-hidden />
            </div>
          )}
        </div>
      </div>
      {/* Info */}
      <div className="mt-7 px-3 pb-3">
        <p className="truncate text-sm font-bold text-dark">
          {businessName || 'Your kitchen name'}
        </p>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-mid">{description}</p>
        )}
        {cuisines.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {cuisines.slice(0, 4).map((c) => (
              <span
                key={c}
                className="rounded-full bg-teal-light px-2 py-0.5 text-[10px] font-medium text-teal-dark"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- shared primitives ----

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fp-card border border-border bg-white">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold text-dark">{title}</h2>
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  counter,
  counterOver,
  children,
}: {
  id: string;
  label: string;
  counter?: string;
  counterOver?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-xs font-semibold text-dark">
          {label}
        </label>
        {counter && (
          <span
            className={cn(
              'text-[11px] font-semibold tabular-nums',
              counterOver ? 'text-amber-600' : 'text-mid',
            )}
          >
            {counter}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-mid">{children}</p>;
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  maxLength,
  inputMode,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  inputMode?: 'text' | 'url' | 'email';
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      placeholder={placeholder}
      required={required}
      minLength={minLength}
      maxLength={maxLength}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-dark placeholder:text-mid focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
    />
  );
}

function ImageSlot({
  id,
  label,
  hint,
  guidance,
  aspect,
  url,
  uploading,
  onPick,
}: {
  id: string;
  label: string;
  hint: string;
  guidance: string;
  aspect: string;
  url: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-dark" id={id}>{label}</p>
      <div
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface',
          aspect,
        )}
      >
        {url ? (
          <Image src={url} alt={label} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
        ) : (
          <ImageOff className="h-8 w-8 text-mid" aria-hidden />
        )}
        {uploading && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Uploading" />
          </div>
        )}
      </div>
      <p className="text-[11px] text-mid">{guidance}</p>
      <p className="text-[11px] text-mid">{hint}</p>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => ref.current?.click()}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        {url ? 'Replace' : 'Upload'}
      </button>
    </div>
  );
}
