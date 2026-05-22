'use client';

import { cn } from '@feastpot/ui';
import { ImageOff, Info, Loader2, Upload } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import {
  useUpdateVendorProfile,
  useUploadVendorImage,
  useVendorProfile,
} from '@/hooks/use-vendor-profile';

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
  instagram: 'https://instagram.com/mamanskitchen',
  tiktok: 'https://tiktok.com/@mamanskitchen',
  facebook: 'https://facebook.com/mamanskitchen',
  youtube: 'https://youtube.com/@mamanskitchen',
};

// Character soft-limits surfaced in the UI (visible counters). The
// underlying API still accepts the longer maxlengths kept on the
// inputs below — these are display hints aligned with the Vendor3
// mockup rather than hard cuts.
const DESC_SOFT_MAX = 160;
const STORY_SOFT_MAX = 1000;

interface FormState {
  businessName: string;
  slug: string;
  description: string;
  cuisines: string;
  specialities: string;
  vendorStory: string;
  featuredDishes: string;
  social: Record<SocialKey, string>;
}

const EMPTY: FormState = {
  businessName: '',
  slug: '',
  description: '',
  cuisines: '',
  specialities: '',
  vendorStory: '',
  featuredDishes: '',
  social: { website: '', instagram: '', tiktok: '', facebook: '', youtube: '' },
};

function splitCommaList(s: string): string[] {
  return s
    .split(/[,\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Business profile editor — redesigned to match the Vendor3 mockup
 * while preserving every existing behaviour: same useVendorProfile
 * hook, same useUpdateVendorProfile mutation, same useUploadVendorImage
 * upload, same slug + social-URL validation, same seed-on-load logic.
 *
 * Mockup layout:
 *   [header — title + subtitle]
 *   ┌─────────────────┬─────────────────┐
 *   │ Imagery         │ Your story      │
 *   │ Identity        │ Social links    │
 *   └─────────────────┴─────────────────┘
 *   [What you cook — full width, 3-col grid]
 *   [Info banner pointing to Delivery + Availability]
 *   [Save profile — bottom right, vendor blue]
 *
 * Intentionally omitted from the mockup:
 *   - "Remove" image button — the update endpoint accepts logoUrl /
 *     coverImageUrl as strings only and has no null clearing path,
 *     so the destructive action would silently no-op or 400. Add
 *     once the backend supports clearing.
 */
export function ProfileForm() {
  const { data: vendor, isLoading } = useVendorProfile();
  const update = useUpdateVendorProfile(vendor?.id);
  const upload = useUploadVendorImage(vendor?.id);
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (vendor && !seeded) {
      const social: Record<SocialKey, string> = {
        website: '',
        instagram: '',
        tiktok: '',
        facebook: '',
        youtube: '',
      };
      for (const k of SOCIAL_KEYS) {
        const v = vendor.socialLinks?.[k];
        if (typeof v === 'string') social[k] = v;
      }
      setForm({
        businessName: vendor.businessName,
        slug: vendor.slug,
        description: vendor.description ?? '',
        cuisines: vendor.cuisines.join(', '),
        specialities: vendor.specialities.join(', '),
        vendorStory: vendor.vendorStory ?? '',
        featuredDishes: vendor.featuredDishes.join(', '),
        social,
      });
      setSeeded(true);
    }
  }, [vendor, seeded]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;
    const trimmedSlug = form.slug.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
      toast({
        title: 'Invalid URL slug',
        description: 'Use lowercase letters, digits, and single hyphens. Example: mamans-kitchen',
        variant: 'destructive',
      });
      return;
    }
    const socialLinks: Record<string, string> = {};
    for (const k of SOCIAL_KEYS) {
      const v = form.social[k].trim();
      if (!v) continue;
      if (!/^https?:\/\//i.test(v)) {
        toast({
          title: `Invalid ${SOCIAL_LABELS[k]} link`,
          description: 'Use a full https:// URL.',
          variant: 'destructive',
        });
        return;
      }
      socialLinks[k] = v;
    }
    try {
      await update.mutateAsync({
        businessName: form.businessName.trim(),
        slug: trimmedSlug,
        description: form.description.trim(),
        cuisineTypes: splitCommaList(form.cuisines),
        specialities: splitCommaList(form.specialities),
        vendorStory: form.vendorStory.trim(),
        featuredDishes: splitCommaList(form.featuredDishes),
        socialLinks,
      });
      toast({
        title: 'Profile saved',
        description: 'Customers see your changes next time the storefront refreshes.',
      });
    } catch (err) {
      toast({
        title: 'Could not save profile',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  if (isLoading && !seeded) {
    return <p className="text-sm text-mid">Loading profile…</p>;
  }
  if (!vendor) {
    return <p className="text-sm text-red-600">Could not load vendor profile.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Business profile</h1>
        <p className="mt-1 text-sm text-mid">
          The name, story and imagery customers see on your Feastpot page.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Section title="Imagery">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ImageSlot
                label="Logo"
                hint="Square, at least 256×256"
                aspect="aspect-square"
                url={vendor.logoUrl}
                uploading={upload.isPending && upload.variables?.kind === 'logo'}
                onPick={(file) =>
                  upload.mutate(
                    { kind: 'logo', file },
                    {
                      onSuccess: () => toast({ title: 'Logo updated' }),
                      onError: (err) =>
                        toast({
                          title: 'Logo upload failed',
                          description: err instanceof Error ? err.message : '',
                          variant: 'destructive',
                        }),
                    },
                  )
                }
              />
              <ImageSlot
                label="Cover"
                hint="Landscape, at least 1200×630"
                aspect="aspect-[16/9]"
                url={vendor.coverImageUrl}
                uploading={upload.isPending && upload.variables?.kind === 'cover'}
                onPick={(file) =>
                  upload.mutate(
                    { kind: 'cover', file },
                    {
                      onSuccess: () => toast({ title: 'Cover updated' }),
                      onError: (err) =>
                        toast({
                          title: 'Cover upload failed',
                          description: err instanceof Error ? err.message : '',
                          variant: 'destructive',
                        }),
                    },
                  )
                }
              />
            </div>
          </Section>

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
            <Field id="slug" label="URL slug">
              <TextInput
                id="slug"
                value={form.slug}
                onChange={(v) => setForm((s) => ({ ...s, slug: v.toLowerCase() }))}
                placeholder="mamans-kitchen-peckham"
                required
                minLength={3}
                maxLength={64}
              />
              <Hint>
                Your public URL:{' '}
                <span className="font-mono text-dark">
                  feastpot.co.uk/vendors/{form.slug || 'your-slug'}
                </span>
              </Hint>
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
                className="resize-none rounded-lg border-border bg-white text-sm text-dark focus-visible:ring-vendor/30"
              />
            </Field>
          </Section>
        </div>

        <div className="space-y-5">
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
                rows={8}
                onChange={(e) => setForm((s) => ({ ...s, vendorStory: e.target.value }))}
                placeholder="Where the recipes come from, who cooks, what makes your kitchen special."
                className="resize-none rounded-lg border-border bg-white text-sm text-dark focus-visible:ring-vendor/30"
              />
              <Hint>Rendered as a long-form section below your short description.</Hint>
            </Field>
          </Section>

          <Section title="Social links" subtitle="Full https:// URLs only. Leave blank to hide a network.">
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
                </Field>
              ))}
            </div>
          </Section>
        </div>
      </div>

      <Section title="What you cook">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Field id="cuisines" label="Cuisines (comma-separated)">
            <TextInput
              id="cuisines"
              value={form.cuisines}
              onChange={(v) => setForm((s) => ({ ...s, cuisines: v }))}
              placeholder="Nigerian, Ghanaian, Caribbean"
            />
            <Hint>e.g. Nigerian, Ghanaian, Caribbean</Hint>
          </Field>
          <Field id="specialities" label="Specialities (comma-separated, up to 12)">
            <TextInput
              id="specialities"
              value={form.specialities}
              onChange={(v) => setForm((s) => ({ ...s, specialities: v }))}
              placeholder="Jollof rice, Egusi soup, Suya, Plantain, Party trays"
            />
            <Hint>e.g. Jollof rice, Egusi soup, Suya</Hint>
          </Field>
          <Field id="featuredDishes" label="Featured dishes (comma-separated, up to 6)">
            <TextInput
              id="featuredDishes"
              value={form.featuredDishes}
              onChange={(v) => setForm((s) => ({ ...s, featuredDishes: v }))}
              placeholder="Sunday party Jollof tray, Weekend pepper soup, Suya sticks"
            />
            <Hint>e.g. Sunday party Jollof tray, Weekend pepper soup</Hint>
          </Field>
        </div>
      </Section>

      <div className="fp-card flex items-start gap-3 border border-vendor-light bg-vendor-light/30 px-4 py-3 text-xs text-dark">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-vendor" aria-hidden />
        <p>
          Service area, delivery radius, fees and minimum order live on the{' '}
          <a
            className="font-semibold text-vendor underline-offset-2 hover:underline"
            href="/settings/delivery"
          >
            Delivery
          </a>{' '}
          page. Opening days, prep lead time and daily caps live on the{' '}
          <a
            className="font-semibold text-vendor underline-offset-2 hover:underline"
            href="/availability"
          >
            Availability
          </a>{' '}
          page.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={update.isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-vendor px-5 text-sm font-semibold text-white transition-colors hover:bg-vendor-dark disabled:opacity-60"
        >
          {update.isPending ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

// ── Local UI primitives ──────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fp-card border border-border bg-white">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold text-dark">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-mid">{subtitle}</p>}
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
  /**
   * When true, the counter is past the recommended (soft) limit.
   * Shown in amber rather than red because the underlying API still
   * accepts longer values (see DESC_SOFT_MAX / STORY_SOFT_MAX) — it's
   * a guidance signal, not a validation error.
   */
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
            title={counterOver ? 'Past the recommended length, but still allowed' : undefined}
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
      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-dark placeholder:text-mid focus:border-vendor focus:outline-none focus:ring-2 focus:ring-vendor/30"
    />
  );
}

function ImageSlot({
  label,
  hint,
  aspect,
  url,
  uploading,
  onPick,
}: {
  label: string;
  hint: string;
  aspect: string;
  url: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-dark">{label}</p>
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
      {/* The mockup also shows a Remove button beside Replace; the
          PATCH /vendors/:id endpoint accepts logoUrl / coverImageUrl
          as strings only with no null-clear path, so we'd silently
          no-op or 400. Wire it once the backend supports clearing. */}
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
