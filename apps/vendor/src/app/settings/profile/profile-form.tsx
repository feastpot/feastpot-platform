'use client';

import { Button, Card, CardContent } from '@feastpot/ui';
import { ImageOff, Loader2, Upload } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { Label } from '@/components/ui/label';
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

export function ProfileForm() {
  const { data: vendor, isLoading } = useVendorProfile();
  const update = useUpdateVendorProfile(vendor?.id);
  const upload = useUploadVendorImage(vendor?.id);
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (vendor && !seeded) {
      const social: Record<SocialKey, string> = { website: '', instagram: '', tiktok: '', facebook: '', youtube: '' };
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
      toast({ title: 'Profile saved', description: 'Customers see your changes next time the storefront refreshes.' });
    } catch (err) {
      toast({
        title: 'Could not save profile',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  if (isLoading && !seeded) return <p className="text-sm text-muted-foreground">Loading profile…</p>;
  if (!vendor) return <p className="text-sm text-destructive">Could not load vendor profile.</p>;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Business profile</h1>
        <p className="text-sm text-muted-foreground">
          The name, story and imagery customers see on your Feastpot page.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="font-medium">Imagery</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageSlot
              label="Logo"
              hint="Square, at least 256×256"
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-medium">Identity</h2>
          <div className="space-y-1.5">
            <Label htmlFor="businessName">Business name</Label>
            <TextInput
              id="businessName"
              value={form.businessName}
              onChange={(v) => setForm((s) => ({ ...s, businessName: v }))}
              required
              minLength={2}
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">URL slug</Label>
            <TextInput
              id="slug"
              value={form.slug}
              onChange={(v) => setForm((s) => ({ ...s, slug: v.toLowerCase() }))}
              placeholder="mamans-kitchen"
              required
              minLength={3}
              maxLength={64}
            />
            <p className="text-xs text-muted-foreground">
              Your public URL: <span className="font-mono">feastpot.co.uk/vendors/{form.slug || 'your-slug'}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Short description</Label>
            <Textarea
              id="description"
              value={form.description}
              maxLength={2000}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="One or two sentences customers see at the top of your page."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-medium">What you cook</h2>
          <div className="space-y-1.5">
            <Label htmlFor="cuisines">Cuisines (comma-separated)</Label>
            <TextInput
              id="cuisines"
              value={form.cuisines}
              onChange={(v) => setForm((s) => ({ ...s, cuisines: v }))}
              placeholder="Nigerian, West African"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="specialities">Specialities (comma-separated, up to 12)</Label>
            <TextInput
              id="specialities"
              value={form.specialities}
              onChange={(v) => setForm((s) => ({ ...s, specialities: v }))}
              placeholder="Jollof rice, Egusi soup, Suya"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="featuredDishes">Featured dishes (comma-separated, up to 6)</Label>
            <TextInput
              id="featuredDishes"
              value={form.featuredDishes}
              onChange={(v) => setForm((s) => ({ ...s, featuredDishes: v }))}
              placeholder="Sunday party Jollof tray, Weekend pepper soup"
            />
            <p className="text-xs text-muted-foreground">
              Highlighted at the top of your customer page. These are free-text names; they don't have to match a menu item.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-medium">Your story</h2>
          <div className="space-y-1.5">
            <Label htmlFor="vendorStory">Vendor story</Label>
            <Textarea
              id="vendorStory"
              value={form.vendorStory}
              maxLength={4000}
              rows={6}
              onChange={(e) => setForm((s) => ({ ...s, vendorStory: e.target.value }))}
              placeholder="Where the recipes come from, who cooks, what makes your kitchen special."
            />
            <p className="text-xs text-muted-foreground">
              Rendered as a long-form section below your short description.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-medium">Social links</h2>
          <p className="text-xs text-muted-foreground">
            Full https:// URLs only. Leave blank to hide a network.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_KEYS.map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`social-${k}`}>{SOCIAL_LABELS[k]}</Label>
                <TextInput
                  id={`social-${k}`}
                  value={form.social[k]}
                  onChange={(v) => setForm((s) => ({ ...s, social: { ...s.social, [k]: v } }))}
                  placeholder="https://"
                  inputMode="url"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
          <p>
            Service area, delivery radius, fees and minimum order live on the{' '}
            <a className="font-semibold text-vendor underline-offset-2 hover:underline" href="/settings/delivery">
              Delivery
            </a>{' '}
            page. Opening days, prep lead time and daily caps live on the{' '}
            <a className="font-semibold text-vendor underline-offset-2 hover:underline" href="/availability">
              Availability
            </a>{' '}
            page.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
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
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function ImageSlot({
  label,
  hint,
  url,
  uploading,
  onPick,
}: {
  label: string;
  hint: string;
  url: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-input bg-muted">
        {url ? (
          <Image src={url} alt={label} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
        ) : (
          <ImageOff className="h-8 w-8 text-muted-foreground" />
        )}
        {uploading && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{hint}</p>
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => ref.current?.click()}
          className="gap-1"
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
      </div>
    </div>
  );
}
