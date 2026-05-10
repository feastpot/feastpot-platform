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
} from '@feastpot/ui';
import { ArrowLeft, Trash2, Upload } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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

const SPICE_LABELS = ['Mild', 'Medium', 'Hot', 'Extra Hot'];

const DIETARY_FLAGS = [
  { value: 'halal', label: 'Halal' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'dairy_free', label: 'Dairy-free' },
];

const FSA_ALLERGENS = [
  'celery', 'gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk',
  'molluscs', 'mustard', 'peanuts', 'sesame', 'soybeans', 'sulphites', 'tree_nuts',
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
  const dietary = tags.filter((t) => DIETARY_FLAGS.some((d) => d.value === t) && t !== 'halal');
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
      toast({ title: 'Save the item first', description: 'Photos can be uploaded after the item is created.' });
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
    return <p className="text-sm text-muted-foreground">Loading item…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/menu/${menuId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to menu
        </Link>
        {!isNew && item && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Available</span>
            <Switch
              checked={form.isAvailable}
              disabled={toggleAvail.isPending}
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
            />
          </div>
        )}
      </div>

      <h1 className="text-2xl font-semibold">{isNew ? 'New item' : form.name || 'Edit item'}</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 p-4">
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
                <Select value={form.category} onValueChange={(v) => setForm((s) => ({ ...s, category: v as ItemCategory }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Description (optional)" hint={`${form.description.length}/500`}>
              <Textarea
                value={form.description}
                maxLength={500}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="What's in it, how it's made, any history…"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Price" required hint={priceErr ?? 'in GBP'}>
                <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                  <span className="pl-3 text-sm text-muted-foreground">£</span>
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
              <Field label="Portion label">
                <Input
                  value={form.portionLabel}
                  onChange={(e) => setForm((s) => ({ ...s, portionLabel: e.target.value }))}
                  maxLength={64}
                  placeholder="Full tray / serves 20"
                />
              </Field>
              <Field label="Servings (optional)">
                <Input
                  type="number"
                  min="1"
                  value={form.servingsCount}
                  onChange={(e) => setForm((s) => ({ ...s, servingsCount: e.target.value }))}
                />
              </Field>
            </div>

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
                    <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={`Spice level: ${SPICE_LABELS[form.spiceLevel] ?? 'Mild'}`}>
              <Slider
                value={[form.spiceLevel]}
                min={0}
                max={3}
                step={1}
                onValueChange={(v) => setForm((s) => ({ ...s, spiceLevel: v[0] ?? 0 }))}
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                {SPICE_LABELS.map((l) => (<span key={l}>{l}</span>))}
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Halal certified</p>
                <p className="text-xs text-muted-foreground">Separate from the Halal dietary flag — for verified certification only.</p>
              </div>
              <Switch
                checked={form.isHalal}
                onCheckedChange={(checked) => setForm((s) => ({ ...s, isHalal: checked }))}
              />
            </div>

            <Field label="Dietary flags">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DIETARY_FLAGS.map((d) => (
                  <CheckboxRow
                    key={d.value}
                    label={d.label}
                    checked={form.dietaryFlags.includes(d.value)}
                    onChange={(checked) =>
                      setForm((s) => ({
                        ...s,
                        dietaryFlags: checked
                          ? [...s.dietaryFlags, d.value]
                          : s.dietaryFlags.filter((f) => f !== d.value),
                      }))
                    }
                  />
                ))}
              </div>
            </Field>

            <Field label="Allergens (FSA 14)">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {FSA_ALLERGENS.map((a) => (
                  <CheckboxRow
                    key={a}
                    label={a.replace('_', ' ')}
                    checked={form.allergens.includes(a)}
                    onChange={(checked) =>
                      setForm((s) => ({
                        ...s,
                        allergens: checked ? [...s.allergens, a] : s.allergens.filter((x) => x !== a),
                      }))
                    }
                  />
                ))}
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Photos</p>
                <p className="text-xs text-muted-foreground">Up to 5. JPEG/PNG/WebP, 5 MB max each.</p>
              </div>
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
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                Save the item first, then come back here to upload photos.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {form.images.map((url) => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-md border">
                  <Image src={url} alt="" fill sizes="120px" className="object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Link href={`/menu/${menuId}`}>
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
          <Button type="submit" disabled={!canSubmit || create.isPending || update.isPending}>
            {isNew ? 'Create item' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
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
      <Label className="flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-2 hover:bg-muted">
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <span className="text-sm capitalize">{label}</span>
    </label>
  );
}
