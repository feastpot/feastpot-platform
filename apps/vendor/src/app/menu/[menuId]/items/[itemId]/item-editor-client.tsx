'use client';

import {
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@feastpot/ui';
import { ArrowLeft, Trash2, Upload } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import {
  useCreateMenuItem,
  useMenuItem,
  useToggleItemAvailability,
  useUpdateMenuItem,
  useUploadItemImage,
  type ItemCategory,
  type MenuItem,
  type MenuItemUpsertInput,
} from '@/hooks/use-menu-items';
import { pencePerPound, poundsFromPence } from '@/lib/format';

const CATEGORIES: Array<{ value: ItemCategory; label: string }> = [
  { value: 'tray', label: 'Tray' },
  { value: 'soup', label: 'Soup' },
  { value: 'protein', label: 'Protein' },
  { value: 'swallow', label: 'Swallow' },
  { value: 'snack', label: 'Snack' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'event', label: 'Event' },
];

const PREP_OPTIONS = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 360, label: '6 hours' },
  { value: 1440, label: '24 hours' },
  { value: 2880, label: '48 hours' },
];

// 4 pill buttons per the brief — 0=Mild .. 3=Extra Hot. Stored as a numeric
// `spice:N` tag on the menu item.
const SPICE_OPTIONS = [
  { value: 0, label: 'Mild', icon: '🌿' },
  { value: 1, label: 'Medium', icon: '🌶️' },
  { value: 2, label: 'Hot', icon: '🌶️🌶️' },
  { value: 3, label: 'Extra Hot', icon: '🌶️🌶️🌶️' },
];

const DIETARY_FLAGS = [
  { value: 'halal', label: 'Halal' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'dairy_free', label: 'Dairy-free' },
];

// FSA 14 statutory allergens — labels and emoji icons for the 2-col grid.
const FSA_ALLERGENS: Array<{ value: string; label: string; icon: string }> = [
  { value: 'celery', label: 'Celery', icon: '🥬' },
  { value: 'gluten', label: 'Gluten', icon: '🌾' },
  { value: 'crustaceans', label: 'Crustaceans', icon: '🦐' },
  { value: 'eggs', label: 'Eggs', icon: '🥚' },
  { value: 'fish', label: 'Fish', icon: '🐟' },
  { value: 'lupin', label: 'Lupin', icon: '🌼' },
  { value: 'milk', label: 'Milk', icon: '🥛' },
  { value: 'molluscs', label: 'Molluscs', icon: '🦪' },
  { value: 'mustard', label: 'Mustard', icon: '🌭' },
  { value: 'peanuts', label: 'Peanuts', icon: '🥜' },
  { value: 'sesame', label: 'Sesame', icon: '🫘' },
  { value: 'soybeans', label: 'Soybeans', icon: '🫛' },
  { value: 'sulphites', label: 'Sulphites', icon: '🍷' },
  { value: 'tree_nuts', label: 'Tree nuts', icon: '🌰' },
];

interface FormState {
  name: string;
  description: string;
  category: ItemCategory;
  pricePounds: string;
  portionLabel: string;
  prepTimeMinutes: number;
  spiceLevel: number;
  isHalal: boolean;
  dietaryFlags: string[];
  allergens: string[];
  servingsCount: string;
  isAvailable: boolean;
  images: string[];
}

const EMPTY: FormState = {
  name: '',
  description: '',
  category: 'tray',
  pricePounds: '',
  portionLabel: '',
  prepTimeMinutes: 240,
  spiceLevel: 0,
  isHalal: false,
  dietaryFlags: [],
  allergens: [],
  servingsCount: '',
  isAvailable: true,
  images: [],
};

const SPICE_PREFIX = 'spice:';
const PORTION_PREFIX = 'portion:';

function fromMenuItem(item: MenuItem): FormState {
  const tags = item.tags ?? [];
  const spiceTag = tags.find((t) => t.startsWith(SPICE_PREFIX));
  const portionTag = tags.find((t) => t.startsWith(PORTION_PREFIX));
  const dietary = tags.filter(
    (t) => DIETARY_FLAGS.some((d) => d.value === t) && t !== 'halal',
  );
  return {
    name: item.name,
    description: item.description ?? '',
    category: item.category,
    pricePounds: poundsFromPence(item.pricePence).toFixed(2),
    portionLabel: portionTag ? portionTag.slice(PORTION_PREFIX.length) : '',
    // The API stores `preparationHours` (rounded up). Best-effort reverse to
    // the closest dropdown option so the UI doesn't show a blank.
    prepTimeMinutes:
      PREP_OPTIONS.find((p) => p.value === item.preparationHours * 60)?.value ?? 240,
    spiceLevel: spiceTag ? Number(spiceTag.slice(SPICE_PREFIX.length)) || 0 : 0,
    isHalal: tags.includes('halal'),
    dietaryFlags: dietary,
    allergens: item.allergens ?? [],
    servingsCount: item.servingsCount?.toString() ?? '',
    isAvailable: item.isAvailable,
    images: item.imageUrls ?? [],
  };
}

export function ItemEditorClient({
  vendorId,
  menuId,
  itemId,
}: {
  vendorId: string;
  menuId: string;
  itemId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isNew = itemId === 'new';

  const { data: item, isLoading } = useMenuItem(vendorId, menuId, itemId);
  const create = useCreateMenuItem(vendorId, menuId);
  const update = useUpdateMenuItem(vendorId, menuId);
  const upload = useUploadItemImage(vendorId, menuId);
  const toggleAvail = useToggleItemAvailability(vendorId, menuId);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [seeded, setSeeded] = useState(false);

  // Seed the form once when the item loads. Subsequent invalidations should
  // NOT clobber unsaved edits.
  useEffect(() => {
    if (!isNew && item && !seeded) {
      setForm(fromMenuItem(item));
      setSeeded(true);
    }
    if (isNew) setSeeded(true);
  }, [isNew, item, seeded]);

  const fileRef = useRef<HTMLInputElement>(null);

  const priceErr = useMemo(() => {
    const n = Number(form.pricePounds);
    if (!form.pricePounds || Number.isNaN(n)) return 'Required';
    if (n < 1) return 'Min £1.00';
    return null;
  }, [form.pricePounds]);

  const canSubmit = form.name.trim().length >= 2 && !priceErr;

  function buildPayload(): MenuItemUpsertInput {
    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      basePricePence: pencePerPound(Number(form.pricePounds)),
      prepTimeMinutes: form.prepTimeMinutes,
      portionLabel: form.portionLabel.trim() || undefined,
      spiceLevel: form.spiceLevel,
      isHalal: form.isHalal,
      dietaryFlags: form.dietaryFlags,
      allergens: form.allergens,
      images: form.images,
      servingsCount: form.servingsCount ? Number(form.servingsCount) : undefined,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const payload = buildPayload();
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        toast({ title: 'Item created' });
        router.replace(`/menu/${menuId}/items/${created.id}`);
      } else {
        await update.mutateAsync({ itemId, ...payload });
        toast({ title: 'Item saved' });
      }
    } catch (err) {
      toast({
        title: 'Could not save item',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  async function onUpload(file: File) {
    if (isNew) {
      toast({
        title: 'Save the item first',
        description: 'Photos can be uploaded after the item is created.',
      });
      return;
    }
    if (form.images.length >= 5) {
      toast({ title: 'Max 5 photos per item', variant: 'destructive' });
      return;
    }
    try {
      const uploaded = await upload.mutateAsync({ itemId, file });
      setForm((s) => ({ ...s, images: [...s.images, uploaded.publicUrl] }));
      toast({ title: 'Photo uploaded' });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  async function removeImage(url: string) {
    if (isNew) {
      setForm((s) => ({ ...s, images: s.images.filter((u) => u !== url) }));
      return;
    }
    const prev = form.images;
    const next = prev.filter((u) => u !== url);
    setForm((s) => ({ ...s, images: next }));
    // Persist immediately so the cover image actually changes; restore the
    // local list if the server rejects the update.
    try {
      await update.mutateAsync({ itemId, images: next });
    } catch (err) {
      setForm((s) => ({ ...s, images: prev }));
      toast({
        title: 'Could not remove photo',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  if (!isNew && isLoading) {
    return <p className="text-sm text-mid">Loading item…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      {/* TOP STRIP — back link + availability toggle. The bottom save bar is
          sticky so this strip is short on purpose: it's just orientation. */}
      <div className="flex items-center justify-between">
        <Link
          href={`/menu/${menuId}`}
          className="inline-flex items-center gap-1 text-sm text-mid hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to menu
        </Link>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-dark">
        {isNew ? 'New item' : form.name || 'Edit item'}
      </h1>

      <form id="item-editor-form" onSubmit={onSubmit} className="space-y-4">
        {/* CARD 1 — Basic info */}
        <SectionCard title="Basic info">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Jollof rice tray (full)"
                maxLength={255}
                required
              />
            </Field>
            <Field label="Category" required>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((s) => ({ ...s, category: v as ItemCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Description" hint={`${form.description.length}/500`}>
            <Textarea
              value={form.description}
              maxLength={500}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="What's in it, how it's made, any history…"
            />
          </Field>

          <Field label="Portion label">
            <Input
              value={form.portionLabel}
              onChange={(e) => setForm((s) => ({ ...s, portionLabel: e.target.value }))}
              maxLength={64}
              placeholder="Full tray / serves 20"
            />
          </Field>
        </SectionCard>

        {/* CARD 2 — Pricing & availability */}
        <SectionCard title="Pricing & availability">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Price" required hint={priceErr ?? 'in GBP'}>
              <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="pl-3 text-sm text-mid">£</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="1"
                  value={form.pricePounds}
                  onChange={(e) => setForm((s) => ({ ...s, pricePounds: e.target.value }))}
                  className="h-10 w-full rounded-md bg-transparent px-2 text-sm focus:outline-none"
                  required
                />
              </div>
            </Field>
            <Field label="Servings (optional)">
              <Input
                type="number"
                min="1"
                value={form.servingsCount}
                onChange={(e) => setForm((s) => ({ ...s, servingsCount: e.target.value }))}
              />
            </Field>
            <Field label="Preparation time" required>
              <Select
                value={String(form.prepTimeMinutes)}
                onValueChange={(v) => setForm((s) => ({ ...s, prepTimeMinutes: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREP_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Big availability switch — teal when on, mid grey when off. For
              EXISTING items the switch is wired to the live `toggleAvail`
              mutation so the change persists immediately. For NEW items the
              switch is disabled because `MenuItemUpsertInput` (POST /items)
              doesn't accept an `isAvailable` field — the server defaults new
              items to available. Vendors can flip availability after the
              item is saved. */}
          <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
            <div>
              <p className="text-sm font-semibold text-dark">Available to order</p>
              <p className="text-xs text-mid">
                {isNew
                  ? 'New items are published as available. Toggle this after saving.'
                  : 'Customers will see this item on your menu when on.'}
              </p>
            </div>
            <Switch
              checked={form.isAvailable}
              disabled={isNew || toggleAvail.isPending}
              onCheckedChange={(checked) => {
                // Optimistic update with rollback on failure so the toggle
                // never gets stuck reflecting a state the server rejected.
                const prev = form.isAvailable;
                setForm((s) => ({ ...s, isAvailable: checked }));
                toggleAvail.mutate(
                  { itemId, isAvailable: checked },
                  {
                    onError: (err) => {
                      setForm((s) => ({ ...s, isAvailable: prev }));
                      toast({
                        title: 'Could not update availability',
                        description: err instanceof Error ? err.message : '',
                        variant: 'destructive',
                      });
                    },
                  },
                );
              }}
              className="data-[state=checked]:bg-teal"
            />
          </div>
        </SectionCard>

        {/* CARD 3 — Dietary flags as toggle pills */}
        <SectionCard title="Dietary flags">
          <p className="text-xs text-mid">
            Surfaced as filter chips on the customer-facing vendor page.
          </p>
          <div className="flex flex-wrap gap-2">
            {DIETARY_FLAGS.map((d) => {
              const active = form.dietaryFlags.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() =>
                    setForm((s) => ({
                      ...s,
                      dietaryFlags: active
                        ? s.dietaryFlags.filter((f) => f !== d.value)
                        : [...s.dietaryFlags, d.value],
                    }))
                  }
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                    active
                      ? 'border-teal bg-teal text-white'
                      : 'border-border bg-white text-mid hover:bg-surface',
                  )}
                  aria-pressed={active}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-2xl bg-surface p-3">
            <div>
              <p className="text-sm font-semibold text-dark">Halal certified</p>
              <p className="text-xs text-mid">
                Separate from the Halal dietary flag — for verified certification only.
              </p>
            </div>
            <Switch
              checked={form.isHalal}
              onCheckedChange={(checked) => setForm((s) => ({ ...s, isHalal: checked }))}
              className="data-[state=checked]:bg-teal"
            />
          </div>
        </SectionCard>

        {/* CARD 4 — Spice level pill buttons */}
        <SectionCard title="Spice level">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SPICE_OPTIONS.map((s) => {
              const active = form.spiceLevel === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setForm((st) => ({ ...st, spiceLevel: s.value }))}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors',
                    active
                      ? 'border-brand bg-brand text-white'
                      : 'border-border bg-white text-mid hover:bg-surface',
                  )}
                  aria-pressed={active}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {s.icon}
                  </span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* CARD 5 — FSA 14 allergens, 2-col grid w/ green-on-checked */}
        <SectionCard title="Allergens (FSA 14)">
          <p className="text-xs text-mid">
            Required by law for any allergen present in the dish.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FSA_ALLERGENS.map((a) => {
              const active = form.allergens.includes(a.value);
              return (
                <button
                  key={a.value}
                  type="button"
                  onClick={() =>
                    setForm((s) => ({
                      ...s,
                      allergens: active
                        ? s.allergens.filter((x) => x !== a.value)
                        : [...s.allergens, a.value],
                    }))
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                    active
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : 'border-border bg-white text-dark hover:bg-surface',
                  )}
                  aria-pressed={active}
                >
                  <span aria-hidden>{a.icon}</span>
                  <span className="flex-1 capitalize">{a.label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded border text-xs',
                      active
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-border',
                    )}
                  >
                    {active ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* CARD 6 — Photos. 5 slots; existing slots show the image, empty
            slots show the upload affordance. (No drag-reorder yet — the
            brief asks for it but the API doesn't expose an image-order
            field, so reordering wouldn't persist. TODO: wire up once the
            schema adds a sortable images array.) */}
        <SectionCard title="Photos">
          <div className="flex items-center justify-between">
            <p className="text-xs text-mid">
              Up to 5. JPEG / PNG / WebP, 5 MB max each.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending || form.images.length >= 5 || isNew}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = '';
              }}
            />
          </div>
          {isNew && (
            <p className="rounded-xl bg-surface p-2 text-xs text-mid">
              Save the item first, then come back here to upload photos.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => {
              const url = form.images[i];
              if (url) {
                return (
                  <div
                    key={url}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-border"
                  >
                    <Image src={url} alt="" fill sizes="120px" className="object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={`empty-${i}`}
                  className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border bg-surface text-xs text-mid"
                  aria-hidden
                >
                  Slot {i + 1}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </form>

      {/* STICKY SAVE BAR — always visible above the bottom safe-area so the
          vendor never has to scroll to commit. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="container flex items-center justify-end gap-2 py-3">
          <Link href={`/menu/${menuId}`}>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button
            // Cross-form submit via the HTML5 `form` attribute — the visible
            // submit lives in the sticky bottom bar, OUTSIDE the actual
            // <form> element, so we associate by id rather than DOM nesting.
            type="submit"
            form="item-editor-form"
            disabled={!canSubmit || create.isPending || update.isPending}
            className="bg-vendor px-6 font-bold text-white hover:bg-vendor-dark"
          >
            {create.isPending || update.isPending
              ? 'Saving…'
              : isNew
                ? 'Create item'
                : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-mid">
          {title}
        </h2>
        <div className="space-y-3">{children}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-sm font-medium text-dark">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-mid">{hint}</p>}
    </div>
  );
}
