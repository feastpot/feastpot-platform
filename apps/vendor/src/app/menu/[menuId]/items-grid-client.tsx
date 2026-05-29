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
import { Badge, Button, Card, CardContent } from '@feastpot/ui';
import { Copy, ExternalLink, GripVertical, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import {
  useCreateMenuItem,
  useDeleteMenuItem,
  useMenuItems,
  useReorderMenuItems,
  useToggleItemAvailability,
  type MenuItem,
  type MenuItemUpsertInput,
} from '@/hooks/use-menu-items';
import { WEB_URL } from '@/lib/env';
import { formatPence } from '@/lib/format';

const CATEGORY_LABEL: Record<MenuItem['category'], string> = {
  tray: 'Tray',
  soup: 'Soup',
  protein: 'Protein',
  swallow: 'Swallow',
  snack: 'Snack',
  frozen: 'Frozen',
  bundle: 'Bundle',
  event: 'Event',
};

export function MenuItemsGridClient({
  vendorId,
  vendorSlug,
  menuId,
  menuName,
}: {
  vendorId: string;
  vendorSlug: string;
  menuId: string;
  menuName: string;
}) {
  const { data: items, isLoading, error } = useMenuItems(vendorId, menuId);
  const reorder = useReorderMenuItems(vendorId, menuId);
  const { toast } = useToast();
  const previewHref = `${WEB_URL}/vendors/${vendorSlug}`;

  // Require a small drag before activating so taps on the card's buttons /
  // switch are never swallowed by the sortable. Keyboard users get an
  // accessible alternative via the handle.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !items) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const nextOrder = arrayMove(items, oldIndex, newIndex);
    reorder.mutate(
      nextOrder.map((it) => it.id),
      {
        onError: (err) =>
          toast({
            title: 'Could not save the new order',
            description: err instanceof Error ? err.message : '',
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/menu" className="text-sm text-muted-foreground hover:underline">
            ← All menus
          </Link>
          <h1 className="text-2xl font-semibold">{menuName}</h1>
          <p className="text-sm text-muted-foreground">
            Drag the handle on each item to set the order. Customers see your
            order within each category.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Preview your menu on the customer site"
          >
            <Button variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" /> Preview as customer
            </Button>
          </a>
          <Link href={`/menu/${menuId}/items/new`}>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Could not load items. {error instanceof Error ? error.message : ''}
          </CardContent>
        </Card>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading items…</p>}

      {!isLoading && items && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground">No items yet in this menu.</p>
            <Link href={`/menu/${menuId}/items/new`}>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Add your first item
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {items && items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((it) => it.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it) => (
                <SortableItemCard key={it.id} vendorId={vendorId} menuId={menuId} item={it} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

/**
 * Map a fetched MenuItem back into the create DTO. The service stores tags
 * in a flattened form, so we split them back out: `spice:N` -> spiceLevel,
 * `portion:LABEL` -> portionLabel, `halal` -> isHalal, anything else is a
 * dietary flag. Price is in pence both directions; preparationHours is
 * stored in hours and the DTO wants minutes, so multiply by 60.
 */
function toUpsertInput(item: MenuItem): MenuItemUpsertInput {
  let portionLabel: string | undefined;
  let spiceLevel: number | undefined;
  let isHalal = false;
  const dietaryFlags: string[] = [];
  for (const t of item.tags) {
    if (t === 'halal') isHalal = true;
    else if (t.startsWith('spice:')) {
      const n = Number.parseInt(t.slice(6), 10);
      if (!Number.isNaN(n)) spiceLevel = n;
    } else if (t.startsWith('portion:')) {
      portionLabel = t.slice(8);
    } else {
      dietaryFlags.push(t);
    }
  }
  return {
    name: `${item.name} (copy)`,
    description: item.description ?? undefined,
    category: item.category,
    basePricePence: item.pricePence,
    prepTimeMinutes: Math.max(item.preparationHours * 60, 15),
    portionLabel,
    spiceLevel,
    isHalal,
    dietaryFlags,
    allergens: item.allergens,
    images: item.imageUrls,
    servingsCount: item.servingsCount ?? undefined,
    isAvailable: false,
  };
}

function SortableItemCard({
  vendorId,
  menuId,
  item,
}: {
  vendorId: string;
  menuId: string;
  item: MenuItem;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-70' : undefined}>
      <ItemCard
        vendorId={vendorId}
        menuId={menuId}
        item={item}
        handleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef }}
      />
    </div>
  );
}

function ItemCard({
  vendorId,
  menuId,
  item,
  handleProps,
}: {
  vendorId: string;
  menuId: string;
  item: MenuItem;
  handleProps: React.HTMLAttributes<HTMLButtonElement> & { ref: (node: HTMLElement | null) => void };
}) {
  const toggle = useToggleItemAvailability(vendorId, menuId);
  const del = useDeleteMenuItem(vendorId, menuId);
  const dup = useCreateMenuItem(vendorId, menuId);
  const { toast } = useToast();
  const cover = item.imageUrls[0];

  const handleDuplicate = () => {
    const input = toUpsertInput(item);
    dup.mutate(input, {
      onSuccess: () =>
        toast({
          title: 'Item duplicated',
          description: `"${input.name}" saved as a draft. Update and publish when ready.`,
        }),
      onError: (err) =>
        toast({
          title: 'Could not duplicate item',
          description: err instanceof Error ? err.message : '',
          variant: 'destructive',
        }),
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[4/3] w-full bg-muted">
        {cover ? (
          // next/image needs explicit width/height OR fill+sizes on a positioned parent.
          <Image src={cover} alt={item.name} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
        <button
          type="button"
          {...handleProps}
          aria-label={`Drag to reorder ${item.name}`}
          title="Drag to reorder"
          className="absolute left-2 top-2 flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {!item.isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-foreground">Unavailable</span>
          </div>
        )}
        {item.moderationStatus === 'held' && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white shadow-sm">
            Pending approval
          </span>
        )}
        {item.moderationStatus === 'rejected' && (
          <span className="absolute right-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground shadow-sm">
            Rejected
          </span>
        )}
      </div>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium leading-tight">{item.name}</p>
            <p className="text-sm text-muted-foreground">{formatPence(item.pricePence)}</p>
          </div>
          <Badge variant="secondary">{CATEGORY_LABEL[item.category]}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              checked={item.isAvailable}
              disabled={toggle.isPending}
              onCheckedChange={(checked) =>
                toggle.mutate(
                  { itemId: item.id, isAvailable: checked },
                  {
                    onError: (err) =>
                      toast({
                        title: 'Could not update availability',
                        description: err instanceof Error ? err.message : '',
                        variant: 'destructive',
                      }),
                  },
                )
              }
            />
            <span className="text-xs text-muted-foreground">Available</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href={`/menu/${menuId}/items/${item.id}`}>
              <Button variant="ghost" size="sm" className="gap-1">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              disabled={dup.isPending}
              onClick={handleDuplicate}
              aria-label={`Duplicate ${item.name}`}
              title="Duplicate as draft"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive hover:text-destructive"
              disabled={del.isPending}
              onClick={() => {
                if (!confirm(`Delete "${item.name}"?`)) return;
                del.mutate(item.id, {
                  onError: (err) =>
                    toast({
                      title: 'Could not delete item',
                      description: err instanceof Error ? err.message : '',
                      variant: 'destructive',
                    }),
                });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
