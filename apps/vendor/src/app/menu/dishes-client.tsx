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
import { Badge, Button, Input, cn } from '@feastpot/ui';
import {
  AlertCircle,
  Camera,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageOff,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import { useCreateMenu, useMenus } from '@/hooks/use-menus';
import {
  useCreateMenuItem,
  useDeleteMenuItem,
  useMenuItems,
  useReorderMenuItems,
  useUpdateMenuItem,
  useUploadItemImage,
  type MenuItem,
  type MenuItemUpsertInput,
} from '@/hooks/use-menu-items';
import { formatPence } from '@/lib/format';

// ── Constants ──────────────────────────────────────────────────────────────

// Known categories listed in preferred display order; custom categories appear after.
const KNOWN_CATEGORY_ORDER = ['tray', 'soup', 'protein', 'swallow', 'snack', 'frozen', 'bundle', 'event'];

/** Title-case a free-text category for display. */
function displayCategory(cat: string): string {
  return cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : cat;
}

const FSA_14 = [
  { slug: 'celery', label: 'Celery' },
  { slug: 'cereals-containing-gluten', label: 'Cereals containing gluten' },
  { slug: 'crustaceans', label: 'Crustaceans' },
  { slug: 'eggs', label: 'Eggs' },
  { slug: 'fish', label: 'Fish' },
  { slug: 'lupin', label: 'Lupin' },
  { slug: 'milk', label: 'Milk' },
  { slug: 'molluscs', label: 'Molluscs' },
  { slug: 'mustard', label: 'Mustard' },
  { slug: 'nuts', label: 'Nuts' },
  { slug: 'peanuts', label: 'Peanuts' },
  { slug: 'sesame', label: 'Sesame' },
  { slug: 'soya', label: 'Soya' },
  { slug: 'sulphur-dioxide', label: 'Sulphur dioxide' },
] as const;

const DIETARY_OPTIONS = [
  { value: 'halal', label: 'Halal' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
] as const;

const SPICE_LABELS = ['None', 'Mild', 'Medium', 'Hot'] as const;

// ── Status helpers ─────────────────────────────────────────────────────────

type DishStatus = 'LIVE' | 'SOLD_OUT' | 'DRAFT';

const LIVE_MODERATION = new Set(['auto_approved', 'approved']);

function getDishStatus(item: MenuItem): DishStatus {
  if (item.isAvailable && LIVE_MODERATION.has(item.moderationStatus)) return 'LIVE';
  if (!item.isAvailable && item.tags.includes('sold_out')) return 'SOLD_OUT';
  return 'DRAFT';
}

function needsAllergenInfo(item: MenuItem): boolean {
  return item.allergens.length === 0 && !item.allergensFreeFrom;
}

// ── Editor form state ──────────────────────────────────────────────────────

interface EditorState {
  name: string;
  category: string;
  pricePounds: string;
  portionLabel: string;
  prepMinutes: string;
  description: string;
  servings: string;
  allergens: string[];
  allergensFreeFrom: boolean;
  dietaryFlags: string[];
  spiceLevel: number;
  stagedFiles: File[];
  existingImageUrls: string[];
  status: DishStatus;
  detailOpen: boolean;
}

function blankEditor(category?: string): EditorState {
  return {
    name: '',
    category: category ?? 'tray',
    pricePounds: '',
    portionLabel: '',
    prepMinutes: '60',
    description: '',
    servings: '',
    allergens: [],
    allergensFreeFrom: false,
    dietaryFlags: [],
    spiceLevel: 0,
    stagedFiles: [],
    existingImageUrls: [],
    status: 'DRAFT',
    detailOpen: false,
  };
}

function editorFromItem(item: MenuItem): EditorState {
  return {
    name: item.name,
    category: item.category,
    pricePounds: (item.pricePence / 100).toFixed(2),
    portionLabel: item.tags.find((t) => t.startsWith('portion:'))?.slice('portion:'.length) ?? '',
    prepMinutes: String(item.preparationHours * 60),
    description: item.description ?? '',
    servings: item.servingsCount ? String(item.servingsCount) : '',
    allergens: [...item.allergens],
    allergensFreeFrom: item.allergensFreeFrom,
    dietaryFlags: item.tags.filter((t) => ['halal', 'vegan', 'vegetarian'].includes(t)),
    spiceLevel: Number(item.tags.find((t) => t.startsWith('spice:'))?.slice('spice:'.length) ?? 0),
    stagedFiles: [],
    existingImageUrls: [...item.imageUrls],
    status: getDishStatus(item),
    detailOpen: false,
  };
}

// ── DishCard ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<DishStatus, { label: string; cls: string }> = {
  LIVE: { label: 'Live', cls: 'bg-green-100 text-green-700' },
  SOLD_OUT: { label: 'Sold out', cls: 'bg-amber-100 text-amber-700' },
  DRAFT: { label: 'Draft', cls: 'bg-charcoal-light/10 text-charcoal-mid' },
};

interface DishCardProps {
  item: MenuItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleSoldOut: () => void;
  isDragging?: boolean;
}

function DishCard({ item, onEdit, onDelete, onToggleSoldOut, isDragging }: DishCardProps) {
  const status = getDishStatus(item);
  const badge = STATUS_BADGE[status];
  const coverUrl = item.imageUrls[0];
  const portionLabel = item.tags.find((t) => t.startsWith('portion:'))?.slice('portion:'.length);

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl bg-white ring-1 ring-cream-deep transition-shadow',
        isDragging && 'shadow-xl ring-brand',
      )}
    >
      {/* Cover photo */}
      <div className="relative h-36 w-full overflow-hidden rounded-t-2xl bg-cream-warm">
        {coverUrl ? (
          <Image src={coverUrl} alt={item.name} fill className="object-cover" sizes="(max-width:640px) 50vw,25vw" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-charcoal-light" />
          </div>
        )}
        <span className={cn('absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold', badge.cls)}>
          {badge.label}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-[13px] font-semibold text-charcoal">{item.name}</p>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-charcoal-mid">
          <span>{formatPence(item.pricePence)}</span>
          {portionLabel && <span>{portionLabel}</span>}
          <span>{item.preparationHours * 60} min</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-cream-deep px-3 py-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
          aria-label={`Edit ${item.name}`}
        >
          <Pencil className="h-3 w-3" aria-hidden />
          Edit
        </button>
        <div className="flex items-center gap-2">
          {/* Quick sold-out toggle - only shown when LIVE or SOLD_OUT */}
          {status !== 'DRAFT' && (
            <button
              type="button"
              onClick={onToggleSoldOut}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                status === 'LIVE'
                  ? 'bg-cream-warm text-charcoal-mid hover:bg-amber-50 hover:text-amber-700'
                  : 'bg-amber-100 text-amber-700 hover:bg-green-100 hover:text-green-700',
              )}
              aria-label={status === 'LIVE' ? 'Mark as sold out' : 'Mark as available'}
            >
              {status === 'LIVE' ? 'Sold out' : 'Available'}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-charcoal-light hover:bg-red-50 hover:text-red-600"
            aria-label={`Delete ${item.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SortableDishCard ───────────────────────────────────────────────────────

function SortableDishCard(props: DishCardProps & { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="relative"
    >
      {/* Drag handle - overlaid in top-right corner */}
      <button
        {...listeners}
        {...attributes}
        className="absolute right-1 top-1 z-10 hidden cursor-grab rounded p-1 text-charcoal-light hover:bg-cream-warm active:cursor-grabbing group-hover:flex"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <DishCard {...props} isDragging={isDragging} />
    </div>
  );
}

// ── AddDishTile ────────────────────────────────────────────────────────────

function AddDishTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-[12rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cream-deep text-charcoal-mid transition-colors hover:border-brand/40 hover:bg-brand-light/20 hover:text-brand"
    >
      <Plus className="h-6 w-6" aria-hidden />
      <span className="text-[13px] font-medium">Add a dish</span>
    </button>
  );
}

// ── CategorySection ────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: string;
  items: MenuItem[];
  onAdd: () => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  onToggleSoldOut: (item: MenuItem) => void;
  onReorder: (newItems: MenuItem[]) => void;
}

function CategorySection({
  category, items, onAdd, onEdit, onDelete, onToggleSoldOut, onReorder,
}: CategorySectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-lg font-black text-charcoal">
          {displayCategory(category)}
        </h2>
        <span className="rounded-full bg-cream-warm px-2 py-0.5 text-[11px] font-semibold text-charcoal-mid">
          {items.length}
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <SortableDishCard
                key={item.id}
                id={item.id}
                item={item}
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete(item)}
                onToggleSoldOut={() => onToggleSoldOut(item)}
              />
            ))}
            <AddDishTile onClick={onAdd} />
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ── DishEditor slide-over ─────────────────────────────────────────────────

interface DishEditorProps {
  open: boolean;
  itemId: string | 'new' | null;
  initial: EditorState;
  vendorId: string;
  menuId: string;
  onClose: () => void;
}

function DishEditor({ open, itemId, initial, vendorId, menuId, onClose }: DishEditorProps) {
  const { toast } = useToast();
  const createItem = useCreateMenuItem(vendorId, menuId);
  const updateItem = useUpdateMenuItem(vendorId, menuId);
  const uploadImage = useUploadItemImage(vendorId, menuId);

  const [form, setForm] = useState<EditorState>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allergenError, setAllergenError] = useState(false);
  const allergenRef = useRef<HTMLFieldSetElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when editor opens with new initial state
  useEffect(() => {
    setForm(initial);
    setDirty(false);
    setAllergenError(false);
  }, [open, itemId]);

  function patch(updates: Partial<EditorState>) {
    setForm((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  }

  function toggleAllergen(slug: string) {
    const next = form.allergens.includes(slug)
      ? form.allergens.filter((a) => a !== slug)
      : [...form.allergens, slug];
    patch({ allergens: next, allergensFreeFrom: false });
  }

  function toggleDietary(flag: string) {
    const next = form.dietaryFlags.includes(flag)
      ? form.dietaryFlags.filter((f) => f !== flag)
      : [...form.dietaryFlags, flag];
    patch({ dietaryFlags: next });
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const total = form.existingImageUrls.length + form.stagedFiles.length + files.length;
    if (total > 5) {
      toast({ title: 'Too many photos', description: 'A dish can have at most 5 photos.', variant: 'destructive' });
      return;
    }
    patch({ stagedFiles: [...form.stagedFiles, ...files] });
    // Reset input so the same file can be re-selected after removal
    e.target.value = '';
  }

  function removeExistingImage(url: string) {
    patch({ existingImageUrls: form.existingImageUrls.filter((u) => u !== url) });
  }

  function removeStagedFile(index: number) {
    patch({ stagedFiles: form.stagedFiles.filter((_, i) => i !== index) });
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) { toast({ title: 'Name is required', variant: 'destructive' }); return; }

    const pricePence = Math.round(parseFloat(form.pricePounds) * 100);
    if (isNaN(pricePence) || pricePence < 100) {
      toast({ title: 'Price must be at least £1.00', variant: 'destructive' });
      return;
    }

    const prepTime = parseInt(form.prepMinutes);
    if (isNaN(prepTime) || prepTime < 15) {
      toast({ title: 'Prep time must be at least 15 minutes', variant: 'destructive' });
      return;
    }

    if (form.status === 'LIVE' && form.allergens.length === 0 && !form.allergensFreeFrom) {
      setAllergenError(true);
      allergenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast({ title: 'Allergen info required', description: 'Declare allergens or tick "contains none" before publishing.', variant: 'destructive' });
      return;
    }

    setAllergenError(false);
    setSaving(true);

    const input: MenuItemUpsertInput = {
      name,
      category: form.category,
      basePricePence: pricePence,
      portionLabel: form.portionLabel || undefined,
      prepTimeMinutes: prepTime,
      description: form.description || undefined,
      servingsCount: form.servings ? parseInt(form.servings) : undefined,
      allergens: form.allergens,
      allergensFreeFrom: form.allergensFreeFrom,
      dietaryFlags: form.dietaryFlags.filter((f) => f !== 'halal'),
      isHalal: form.dietaryFlags.includes('halal'),
      spiceLevel: form.spiceLevel,
      isAvailable: form.status === 'LIVE',
      soldOut: form.status === 'SOLD_OUT',
    };

    try {
      let savedItemId: string;

      if (itemId === 'new') {
        const created = await createItem.mutateAsync(input);
        savedItemId = created.id;
      } else {
        // If existing images were removed, send the updated list
        const imagesDirty =
          form.existingImageUrls.length !== initial.existingImageUrls.length;
        await updateItem.mutateAsync({
          itemId: itemId!,
          ...input,
          ...(imagesDirty ? { images: form.existingImageUrls } : {}),
        });
        savedItemId = itemId!;
      }

      // Upload any staged photos
      let uploadError = false;
      for (const file of form.stagedFiles) {
        try {
          await uploadImage.mutateAsync({ itemId: savedItemId, file });
        } catch {
          uploadError = true;
        }
      }

      if (uploadError) {
        toast({
          title: 'Dish saved, but some photos failed to upload',
          description: 'You can add photos again by editing the dish.',
          variant: 'destructive',
        });
      } else {
        toast({ title: itemId === 'new' ? 'Dish added' : 'Dish updated' });
      }

      onClose();
    } catch (err) {
      const msg = (err as { message?: string }).message ?? 'Something went wrong';
      toast({ title: 'Could not save dish', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (dirty && !saving) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    onClose();
  }

  // Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dirty, saving]);

  if (!open) return null;

  const totalPhotos = form.existingImageUrls.length + form.stagedFiles.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={itemId === 'new' ? 'Add a dish' : 'Edit dish'}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl sm:w-[520px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cream-deep px-5 py-4">
          <h2 className="font-display text-lg font-black text-charcoal">
            {itemId === 'new' ? 'Add a dish' : 'Edit dish'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-charcoal-light hover:bg-cream-warm"
            aria-label="Close editor"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ESSENTIALS */}

          {/* Photos */}
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-charcoal">Photos</label>
            <div className="flex flex-wrap gap-2">
              {form.existingImageUrls.map((url) => (
                <div key={url} className="relative h-16 w-16 rounded-lg overflow-hidden ring-1 ring-cream-deep">
                  <Image src={url} alt="" fill className="object-cover" sizes="64px" />
                  <button
                    type="button"
                    onClick={() => removeExistingImage(url)}
                    className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white hover:bg-black/80"
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              ))}
              {form.stagedFiles.map((file, i) => (
                <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden ring-1 ring-brand/40">
                  <Image
                    src={URL.createObjectURL(file)}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="64px"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => removeStagedFile(i)}
                    className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white hover:bg-black/80"
                    aria-label="Remove staged photo"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              ))}
              {totalPhotos < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-cream-deep text-charcoal-mid hover:border-brand/40 hover:text-brand"
                  aria-label="Add photo"
                >
                  <Camera className="h-5 w-5" aria-hidden />
                  <span className="text-[10px]">Add</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={handleFileSelect}
              />
            </div>
            <p className="mt-1 text-[11px] text-charcoal-mid">JPEG, PNG or WebP. Up to 5 photos, 5 MB each. First photo is the cover.</p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="dish-name" className="mb-1 block text-[13px] font-semibold text-charcoal">
              Dish name <span className="text-red-500" aria-hidden>*</span>
            </label>
            <Input
              id="dish-name"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Jollof rice with chicken"
              maxLength={255}
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="dish-category" className="mb-1 block text-[13px] font-semibold text-charcoal">
              Category <span className="text-red-500" aria-hidden>*</span>
            </label>
            <Input
              id="dish-category"
              value={form.category}
              onChange={(e) => patch({ category: e.target.value })}
              placeholder="e.g. Tray, Soup, Protein"
              maxLength={64}
            />
          </div>

          {/* Price */}
          <div>
            <label htmlFor="dish-price" className="mb-1 block text-[13px] font-semibold text-charcoal">
              Price <span className="text-red-500" aria-hidden>*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-mid">£</span>
              <Input
                id="dish-price"
                type="number"
                step="0.01"
                min="1"
                value={form.pricePounds}
                onChange={(e) => patch({ pricePounds: e.target.value })}
                className="pl-7"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Portion label + Prep time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dish-portion" className="mb-1 block text-[13px] font-semibold text-charcoal">
                Portion label
              </label>
              <Input
                id="dish-portion"
                value={form.portionLabel}
                onChange={(e) => patch({ portionLabel: e.target.value })}
                placeholder="e.g. Serves 2"
                maxLength={64}
              />
            </div>
            <div>
              <label htmlFor="dish-prep" className="mb-1 block text-[13px] font-semibold text-charcoal">
                Prep time (min) <span className="text-red-500" aria-hidden>*</span>
              </label>
              <Input
                id="dish-prep"
                type="number"
                min="15"
                step="15"
                value={form.prepMinutes}
                onChange={(e) => patch({ prepMinutes: e.target.value })}
                placeholder="60"
              />
            </div>
          </div>

          {/* Allergens */}
          <fieldset
            ref={allergenRef}
            className={cn(
              'rounded-xl border p-4',
              allergenError ? 'border-red-400 bg-red-50' : 'border-cream-deep',
            )}
          >
            <legend className="px-1 text-[13px] font-semibold text-charcoal">
              Allergens (FSA 14) <span className="text-red-500" aria-hidden>*</span>
            </legend>
            {allergenError && (
              <p className="mb-2 flex items-center gap-1 text-[12px] font-medium text-red-600">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                Tick at least one allergen or confirm none apply before publishing.
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {FSA_14.map(({ slug, label }) => (
                <label key={slug} className="flex cursor-pointer items-center gap-2 text-[13px] text-charcoal">
                  <input
                    type="checkbox"
                    data-testid={`allergen-${slug}`}
                    checked={form.allergens.includes(slug)}
                    onChange={() => toggleAllergen(slug)}
                    className="h-3.5 w-3.5 accent-brand"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-3 border-t border-cream-deep pt-3">
              <label className="flex cursor-pointer items-start gap-2 text-[13px] text-charcoal">
                <input
                  type="checkbox"
                  data-testid="allergen-none"
                  checked={form.allergensFreeFrom}
                  disabled={form.allergens.length > 0}
                  onChange={(e) => patch({ allergensFreeFrom: e.target.checked, allergens: [] })}
                  className="mt-0.5 h-3.5 w-3.5 accent-brand disabled:opacity-40"
                />
                <span>
                  This dish contains <strong>none</strong> of the 14 allergens
                  {form.allergens.length > 0 && (
                    <span className="ml-1 text-charcoal-mid">(clear allergens above to use this)</span>
                  )}
                </span>
              </label>
            </div>
          </fieldset>

          {/* Status */}
          <div>
            <p className="mb-2 text-[13px] font-semibold text-charcoal">Status</p>
            <div className="flex gap-2">
              {(['DRAFT', 'LIVE', ...(itemId !== 'new' ? ['SOLD_OUT'] : [])] as DishStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ status: s })}
                  className={cn(
                    'rounded-full px-3 py-1 text-[13px] font-medium transition-colors',
                    form.status === s
                      ? s === 'LIVE' ? 'bg-green-600 text-white'
                        : s === 'SOLD_OUT' ? 'bg-amber-500 text-white'
                          : 'bg-charcoal text-white'
                      : 'bg-cream-warm text-charcoal-mid hover:bg-cream-deep',
                  )}
                >
                  {s === 'SOLD_OUT' ? 'Sold out' : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {form.status === 'LIVE' && (
              <p className="mt-1.5 text-[11px] text-charcoal-mid">
                Live dishes are visible to customers. Allergen info must be declared.
              </p>
            )}
          </div>

          {/* ADD MORE DETAIL (collapsible) */}
          <div className="rounded-xl border border-cream-deep">
            <button
              type="button"
              onClick={() => patch({ detailOpen: !form.detailOpen })}
              className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold text-charcoal"
              aria-expanded={form.detailOpen}
            >
              Add more detail
              {form.detailOpen ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            </button>

            {form.detailOpen && (
              <div className="space-y-4 border-t border-cream-deep px-4 pb-4 pt-3">

                {/* Description */}
                <div>
                  <label htmlFor="dish-desc" className="mb-1 block text-[13px] font-semibold text-charcoal">
                    Description
                  </label>
                  <textarea
                    id="dish-desc"
                    value={form.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    placeholder="Tell customers what makes this dish special."
                    className="w-full resize-none rounded-lg border border-cream-deep bg-white px-3 py-2 text-[14px] text-charcoal placeholder:text-charcoal-light focus:outline-none focus:ring-2 focus:ring-brand/40"
                  />
                </div>

                {/* Servings */}
                <div>
                  <label htmlFor="dish-servings" className="mb-1 block text-[13px] font-semibold text-charcoal">
                    Servings per portion
                  </label>
                  <Input
                    id="dish-servings"
                    type="number"
                    min="1"
                    value={form.servings}
                    onChange={(e) => patch({ servings: e.target.value })}
                    placeholder="e.g. 4"
                    className="max-w-[8rem]"
                  />
                </div>

                {/* Dietary preferences */}
                <fieldset>
                  <legend className="mb-2 text-[13px] font-semibold text-charcoal">Dietary</legend>
                  <p className="mb-2 text-[11px] text-charcoal-mid">
                    Lifestyle preferences. Gluten-free and dairy-free are expressed via the allergens section above.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {DIETARY_OPTIONS.map(({ value, label }) => (
                      <label key={value} className="flex cursor-pointer items-center gap-2 text-[13px] text-charcoal">
                        <input
                          type="checkbox"
                          checked={form.dietaryFlags.includes(value)}
                          onChange={() => toggleDietary(value)}
                          className="h-3.5 w-3.5 accent-brand"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* Spice level */}
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-charcoal">Spice level</p>
                  <div className="flex gap-2">
                    {SPICE_LABELS.map((label, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => patch({ spiceLevel: i })}
                        className={cn(
                          'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                          form.spiceLevel === i
                            ? 'bg-charcoal text-white'
                            : 'bg-cream-warm text-charcoal-mid hover:bg-cream-deep',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-cream-deep px-5 py-4">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save dish'}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── DishesClient (main) ────────────────────────────────────────────────────

export function DishesClient({ vendorId }: { vendorId: string }) {
  const { toast } = useToast();
  const menus = useMenus(vendorId);
  const createMenu = useCreateMenu(vendorId);

  // Primary menu: oldest active menu for this vendor.
  // Auto-created on first load if none exists (new vendor).
  const [primaryMenuId, setPrimaryMenuId] = useState<string | null>(null);
  const [creatingMenu, setCreatingMenu] = useState(false);

  const primaryMenuIdMemo = useMemo(() => {
    if (!menus.data) return null;
    const sorted = [...menus.data]
      .filter((m) => m.isActive)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sorted[0]?.id ?? null;
  }, [menus.data]);

  useEffect(() => {
    if (primaryMenuIdMemo) {
      setPrimaryMenuId(primaryMenuIdMemo);
    } else if (menus.data && !menus.isLoading && !creatingMenu) {
      // Vendor has no active menu yet -- auto-create one
      setCreatingMenu(true);
      createMenu.mutate(
        { name: 'Dishes' },
        {
          onSuccess: (menu) => setPrimaryMenuId(menu.id),
          onError: () => toast({ title: 'Could not create your dish list. Please reload.', variant: 'destructive' }),
        },
      );
    }
  }, [primaryMenuIdMemo, menus.data, menus.isLoading, creatingMenu]);

  const items = useMenuItems(vendorId, primaryMenuId ?? undefined);
  const deleteItem = useDeleteMenuItem(vendorId, primaryMenuId ?? '');
  const updateItem = useUpdateMenuItem(vendorId, primaryMenuId ?? '');
  const reorderItems = useReorderMenuItems(vendorId, primaryMenuId ?? '');

  // Editor state
  const [editingItemId, setEditingItemId] = useState<string | 'new' | null>(null);
  const [editorInitial, setEditorInitial] = useState<EditorState>(blankEditor());
  const [defaultCategory, setDefaultCategory] = useState<string>('tray');

  // Search + allergen filter
  const [searchQuery, setSearchQuery] = useState('');
  const [allergenFilter, setAllergenFilter] = useState(false);

  // Grouped and filtered items
  const allItems = items.data ?? [];

  const filteredItems = useMemo(() => {
    let list = allItems;
    if (allergenFilter) list = list.filter(needsAllergenInfo);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allItems, allergenFilter, searchQuery]);

  const byCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    // Known categories in predefined display order, then any custom categories alphabetically
    const allCats = Array.from(new Set(filteredItems.map((i) => i.category)));
    const ordered = [
      ...KNOWN_CATEGORY_ORDER.filter((c) => allCats.includes(c)),
      ...allCats.filter((c) => !KNOWN_CATEGORY_ORDER.includes(c)).sort(),
    ];
    for (const cat of ordered) {
      const catItems = filteredItems
        .filter((i) => i.category === cat)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (catItems.length > 0) map.set(cat, catItems);
    }
    return map;
  }, [filteredItems]);

  const allergenCount = useMemo(() => allItems.filter(needsAllergenInfo).length, [allItems]);

  function openNew(category?: string) {
    const cat = category ?? defaultCategory;
    setDefaultCategory(cat);
    setEditorInitial(blankEditor(cat));
    setEditingItemId('new');
  }

  function openEdit(item: MenuItem) {
    setEditorInitial(editorFromItem(item));
    setEditingItemId(item.id);
  }

  function closeEditor() {
    setEditingItemId(null);
  }

  async function handleDelete(item: MenuItem) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await deleteItem.mutateAsync(item.id);
      toast({ title: `"${item.name}" deleted` });
    } catch {
      toast({ title: 'Could not delete dish', variant: 'destructive' });
    }
  }

  async function handleToggleSoldOut(item: MenuItem) {
    const status = getDishStatus(item);
    try {
      if (status === 'LIVE') {
        await updateItem.mutateAsync({ itemId: item.id, isAvailable: false, soldOut: true });
      } else if (status === 'SOLD_OUT') {
        await updateItem.mutateAsync({ itemId: item.id, isAvailable: true, soldOut: false });
      }
    } catch (err) {
      const msg = (err as { message?: string }).message;
      toast({ title: 'Could not update status', description: msg, variant: 'destructive' });
    }
  }

  function handleCategoryReorder(category: string, newCatItems: MenuItem[]) {
    // Rebuild full ordered list preserving relative order of all other categories
    const newOrder = Array.from(byCategory.entries()).flatMap(([cat, catItems]) =>
      cat === category ? newCatItems : catItems,
    );
    reorderItems.mutate(newOrder.map((i) => i.id));
  }

  const isLoading = menus.isLoading || items.isLoading || creatingMenu;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 lg:px-12">
      {/* Page title */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-black text-charcoal">Dishes</h1>
        <Button onClick={() => openNew()} disabled={!primaryMenuId}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Add a dish
        </Button>
      </div>

      {/* Status strip - only when there are issues */}
      {allergenCount > 0 && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <div className="flex items-center gap-2 text-[13px] text-amber-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span>
              {allergenCount === 1
                ? '1 dish needs allergen info before it can go live'
                : `${allergenCount} dishes need allergen info before they can go live`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAllergenFilter((f) => !f)}
            className={cn(
              'flex-shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors',
              allergenFilter
                ? 'bg-amber-600 text-white'
                : 'bg-amber-100 text-amber-800 hover:bg-amber-200',
            )}
          >
            {allergenFilter ? 'Show all' : 'Show affected'}
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-light" aria-hidden />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search dishes..."
          className="pl-9"
          aria-label="Search dishes"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-light hover:text-charcoal"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl bg-cream-warm" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && allItems.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cream-warm">
            <ImageOff className="h-8 w-8 text-charcoal-light" aria-hidden />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-charcoal">No dishes yet</p>
            <p className="mt-1 text-[13px] text-charcoal-mid">Add your first dish to get started.</p>
          </div>
          <Button onClick={() => openNew()}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add a dish
          </Button>
        </div>
      )}

      {/* No search results */}
      {!isLoading && allItems.length > 0 && filteredItems.length === 0 && (
        <p className="py-12 text-center text-[14px] text-charcoal-mid">
          No dishes match your search.
        </p>
      )}

      {/* Grid grouped by category */}
      {!isLoading && byCategory.size > 0 && (
        <div className="space-y-10">
          {Array.from(byCategory.entries()).map(([cat, catItems]) => (
            <CategorySection
              key={cat}
              category={cat}
              items={catItems}
              onAdd={() => openNew(cat)}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggleSoldOut={handleToggleSoldOut}
              onReorder={(newItems) => handleCategoryReorder(cat, newItems)}
            />
          ))}
        </div>
      )}

      {/* Slide-over editor */}
      {primaryMenuId && (
        <DishEditor
          open={editingItemId !== null}
          itemId={editingItemId}
          initial={editorInitial}
          vendorId={vendorId}
          menuId={primaryMenuId}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
