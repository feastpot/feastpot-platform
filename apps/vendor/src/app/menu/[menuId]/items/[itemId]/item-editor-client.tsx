'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { ArrowLeft, GripVertical, Trash2, Upload } from 'lucide-react';
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

// 4 pill buttons per the brief - 0=Mild .. 3=Extra Hot. Stored as a numeric
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

// FSA 14 statutory allergens - labels and emoji icons for the 2-col grid.
// Values MUST match the canonical slugs accepted by the API validateAllergens
// helper (cereals-containing-gluten, soya, sulphur-dioxide, nuts - NOT the
// old legacy forms gluten / soybeans / sulphites / tree_nuts).
const FSA_ALLERGENS: Array<{ value: string; label: string; icon: string }> = [
  { value: 'celery', label: 'Celery', icon: '🥬' },
  { value: 'cereals-containing-gluten', label: 'Gluten (cereals)', icon: '🌾' },
  { value: 'crustaceans', label: 'Crustaceans', icon: '🦐' },
  { value: 'eggs', label: 'Eggs', icon: '🥚' },
  { value: 'fish', label: 'Fish', icon: '🐟' },
  { value: 'lupin', label: 'Lupin', icon: '🌼' },
  { value: 'milk', label: 'Milk', icon: '🥛' },
  { value: 'molluscs', label: 'Molluscs', icon: '🦪' },
  { value: 'mustard', label: 'Mustard', icon: '🌭' },
  { value: 'nuts', label: 'Tree nuts', icon: '🌰' },
  { value: 'peanuts', label: 'Peanuts', icon: '🥜' },
  { value: 'sesame', label: 'Sesame', icon: '🫘' },
  { value: 'soya', label: 'Soybeans (soya)', icon: '🫛' },
  { value: 'sulphur-dioxide', label: 'Sulphites / SO₂', icon: '🍷' },
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
  isAvailable: false,
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
    prepTimeMinutes: PREP_OPTIONS.find((p) => p.value === item.preparationHours * 60)?.value ?? 240,
    spiceLevel: spiceTag ? Number(spiceTag.slice(SPICE_PREFIX.length)) || 0 : 0,
    isHalal: tags.includes('halal'),
    dietaryFlags: dietary,
    allergens: item.allergens ?? [],
    servingsCount: item.servingsCount?.toString() ?? '',
    isAvailable: item.isAvailable,
    images: item.imageUrls ?? [],
  };
}

/** File queued for upload on a new item – holds a revocable preview URL. */
interface PendingFile {
  file: File;
  previewUrl: string;
}

export function ItemEditorClient({
  vendorId,
  menuId,
  itemId,
  onCreated,
  onSaved,
  onCancel,
}: {
  vendorId: string;
  menuId: string;
  itemId: string;
  /**
   * When provided the component operates in "inline" mode (embedded inside
   * the menu detail page rather than rendered as a standalone route).
   * Called with the newly-created item id after a successful create.
   */
  onCreated?: (id: string) => void;
  /**
   * Inline mode (edit path): called after a successful update so the parent
   * can close the inline panel.
   */
  onSaved?: () => void;
  /** Inline mode: called when the user dismisses the form without saving. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isNew = itemId === 'new';
  const isInline = onCreated !== undefined || onSaved !== undefined || onCancel !== undefined;

  const { data: item, isLoading } = useMenuItem(vendorId, menuId, itemId);
  const create = useCreateMenuItem(vendorId, menuId);
  const update = useUpdateMenuItem(vendorId, menuId);
  const upload = useUploadItemImage(vendorId, menuId);
  const toggleAvail = useToggleItemAvailability(vendorId, menuId);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [seeded, setSeeded] = useState(false);

  // Files selected before the item has been created. Stored as {file, previewUrl}
  // pairs so we can show a thumbnail while the item doesn't have a real id yet.
  // Uploaded sequentially inside onSubmit immediately after creation.
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  // Keep a stable ref so the unmount cleanup can access the latest list
  // without needing to add it to the dependency array.
  const pendingFilesRef = useRef<PendingFile[]>([]);
  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  // Revoke all pending object URLs on unmount to avoid memory leaks.
  useEffect(() => {
    return () => {
      for (const { previewUrl } of pendingFilesRef.current) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

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

  // Total photo slots consumed: uploaded images + locally-queued pending files.
  const totalPhotoCount = form.images.length + (isNew ? pendingFiles.length : 0);

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
      // Send the publish flag on every upsert. New items default to draft
      // (false) so vendors can iterate before going live; existing items
      // keep whatever the toggle currently shows.
      isAvailable: form.isAvailable,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const payload = buildPayload();
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);

        // Upload any files that were queued before the item existed.
        // We do this sequentially so slot order is predictable and each
        // upload can be individually retried if it fails.
        const queued = [...pendingFiles];
        setPendingFiles([]);
        for (const { file, previewUrl } of queued) {
          try {
            await upload.mutateAsync({ itemId: created.id, file });
          } catch {
            toast({
              title: `Could not upload "${file.name}"`,
              description: 'You can add it again from the edit screen.',
              variant: 'destructive',
            });
          }
          URL.revokeObjectURL(previewUrl);
        }

        toast({ title: 'Item created' });

        if (onCreated) {
          onCreated(created.id);
        } else {
          router.replace(`/menu/${menuId}/items/${created.id}`);
        }
      } else {
        await update.mutateAsync({ itemId, ...payload });
        toast({ title: 'Item saved' });
        onSaved?.();
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
    if (totalPhotoCount >= 5) {
      toast({ title: 'Max 5 photos per item', variant: 'destructive' });
      return;
    }

    if (isNew) {
      // Queue the file locally with a blob preview; it will be uploaded
      // right after the item is created inside onSubmit.
      const previewUrl = URL.createObjectURL(file);
      setPendingFiles((prev) => [...prev, { file, previewUrl }]);
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

  function removePendingFile(index: number) {
    setPendingFiles((prev) => {
      const entry = prev[index];
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
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

  // Drag-reorder the photos. Array position IS the order: index 0 is always
  // the cover image. We rewrite the whole array and persist via the existing
  // update endpoint (same path removeImage uses), rolling back on failure.
  async function reorderImages(activeUrl: string, overUrl: string) {
    const prev = form.images;
    const oldIndex = prev.indexOf(activeUrl);
    const newIndex = prev.indexOf(overUrl);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    const next = arrayMove(prev, oldIndex, newIndex);
    setForm((s) => ({ ...s, images: next }));
    // A brand-new item has no id yet, so there is nothing to persist - the
    // reordered array is sent with the create call on save.
    if (isNew) return;
    try {
      await update.mutateAsync({ itemId, images: next });
    } catch (err) {
      setForm((s) => ({ ...s, images: prev }));
      toast({
        title: 'Could not save photo order',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  const photoSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handlePhotoDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    void reorderImages(String(active.id), String(over.id));
  };

  function handleCancel() {
    // Revoke any pending object URLs before dismissing.
    for (const { previewUrl } of pendingFiles) {
      URL.revokeObjectURL(previewUrl);
    }
    setPendingFiles([]);
    onCancel?.();
  }

  if (!isNew && isLoading) {
    return <p className="text-sm text-mid">Loading item…</p>;
  }

  const isSaving = create.isPending || update.isPending;
  const formId = `item-editor-form-${itemId}`;

  // -----------------------------------------------------------------------
  // INLINE MODE (embedded on the menu detail page)
  // -----------------------------------------------------------------------
  if (isInline) {
    return (
      <div className="space-y-4">
        {/* Inline header with title + action buttons */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight text-dark">
            {isNew ? 'New item' : form.name || 'Edit item'}
          </h2>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={!canSubmit || isSaving}
              className="bg-teal px-6 font-bold text-white hover:bg-teal-dark"
            >
              {isSaving ? 'Saving…' : isNew ? 'Create item' : 'Save changes'}
            </Button>
          </div>
        </div>

        <form id={formId} onSubmit={onSubmit} className="space-y-4">
          {renderFormSections()}
        </form>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // PAGE MODE (standalone route)
  // -----------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      {/* TOP STRIP - back link + availability toggle. The bottom save bar is
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

      <form id={formId} onSubmit={onSubmit} className="space-y-4">
        {renderFormSections()}
      </form>

      {/* STICKY SAVE BAR - always visible above the bottom safe-area so the
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
            // Cross-form submit via the HTML5 `form` attribute - the visible
            // submit lives in the sticky bottom bar, OUTSIDE the actual
            // <form> element, so we associate by id rather than DOM nesting.
            type="submit"
            form={formId}
            disabled={!canSubmit || isSaving}
            className="bg-teal px-6 font-bold text-white hover:bg-teal-dark"
          >
            {isSaving ? 'Saving…' : isNew ? 'Create item' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );

  // -----------------------------------------------------------------------
  // Shared form body (extracted to avoid duplication between modes)
  // -----------------------------------------------------------------------
  function renderFormSections() {
    return (
      <>
        {/* CARD 1 - Basic info */}
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

        {/* CARD 2 - Pricing & availability */}
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

          {/* Draft banner - shown whenever the item is not yet published. */}
          {!form.isAvailable && (
            <div className="rounded-xl bg-[#FAEEDA] px-4 py-3">
              <p className="m-0 mb-0.5 text-[13px] font-semibold text-[#633806]">
                Draft - not visible to customers
              </p>
              <p className="m-0 text-[11px] text-[#7A4A1C]">
                Toggle &quot;Available to customers&quot; below to publish.
              </p>
            </div>
          )}

          {/* Availability switch */}
          <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
            <div>
              <p className="text-sm font-semibold text-dark">Available to customers</p>
              <p className="text-xs text-mid">
                {form.isAvailable ? 'Visible in your menu' : 'Hidden - draft mode'}
              </p>
            </div>
            <Switch
              checked={form.isAvailable}
              disabled={!isNew && toggleAvail.isPending}
              onCheckedChange={(checked) => {
                if (isNew) {
                  setForm((s) => ({ ...s, isAvailable: checked }));
                  return;
                }
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

        {/* CARD 3 - Dietary flags as toggle pills */}
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
                Separate from the Halal dietary flag - for verified certification only.
              </p>
            </div>
            <Switch
              checked={form.isHalal}
              onCheckedChange={(checked) => setForm((s) => ({ ...s, isHalal: checked }))}
              className="data-[state=checked]:bg-teal"
            />
          </div>
        </SectionCard>

        {/* CARD 4 - Spice level pill buttons */}
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

        {/* CARD 5 - FSA 14 allergens, 2-col grid w/ green-on-checked */}
        <SectionCard title="Allergens (FSA 14)">
          <p className="text-xs text-mid">Required by law for any allergen present in the dish.</p>
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
                      active ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border',
                    )}
                  >
                    {active ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* CARD 6 - Photos. Up to 5 slots. New items: selecting a file queues
            it locally (shown with a "Queued" badge) and the batch is uploaded
            immediately after the item is created. Existing items: files are
            uploaded right away. Drag to reorder - first photo is the cover. */}
        <SectionCard title="Photos">
          <div className="flex items-center justify-between">
            <p className="text-xs text-mid">
              Up to 5. JPEG / PNG / WebP, 5 MB max each.{' '}
              {!isNew && 'Drag to reorder; the first photo is the cover.'}
              {isNew && totalPhotoCount > 0 && 'Photos will upload when you create the item.'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending || totalPhotoCount >= 5}
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
                if (f) void onUpload(f);
                e.target.value = '';
              }}
            />
          </div>

          <DndContext
            sensors={photoSensors}
            collisionDetection={closestCenter}
            onDragEnd={handlePhotoDragEnd}
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {/* Uploaded / saved images (sortable via DnD) */}
              <SortableContext items={form.images} strategy={rectSortingStrategy}>
                {form.images.map((url, i) => (
                  <SortablePhoto
                    key={url}
                    url={url}
                    isCover={i === 0}
                    canDrag={form.images.length > 1 && !update.isPending}
                    onRemove={() => void removeImage(url)}
                  />
                ))}
              </SortableContext>

              {/* Locally-queued files (new item only) - shown as previews */}
              {isNew &&
                pendingFiles.map(({ previewUrl }, i) => (
                  <PendingPhoto
                    key={previewUrl}
                    previewUrl={previewUrl}
                    onRemove={() => removePendingFile(i)}
                  />
                ))}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 5 - totalPhotoCount) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border bg-surface text-xs text-mid"
                  aria-hidden
                >
                  Slot {totalPhotoCount + i + 1}
                </div>
              ))}
            </div>
          </DndContext>
        </SectionCard>
      </>
    );
  }
}

function SortablePhoto({
  url,
  isCover,
  canDrag,
  onRemove,
}: {
  url: string;
  isCover: boolean;
  canDrag: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: url, disabled: !canDrag });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-xl border border-border',
        isDragging && 'opacity-70',
      )}
    >
      <Image src={url} alt="" fill sizes="120px" className="object-cover" />
      {isCover && (
        <span className="absolute left-1 top-1 rounded bg-[#1E7B34] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
          Cover
        </span>
      )}
      {canDrag && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder photo"
          title="Drag to reorder"
          className="absolute bottom-1 left-1 flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        aria-label="Remove photo"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Preview thumbnail for a locally-queued file (new items only). */
function PendingPhoto({ previewUrl, onRemove }: { previewUrl: string; onRemove: () => void }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-dashed border-brand/40 bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt="" className="h-full w-full object-cover opacity-80" />
      <span className="absolute left-1 top-1 rounded bg-brand/80 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
        Queued
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        aria-label="Remove queued photo"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-mid">{title}</h2>
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
