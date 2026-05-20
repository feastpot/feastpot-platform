'use client';

import { Badge, Button, Card, CardContent } from '@feastpot/ui';
import { Copy, ExternalLink, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import {
  useCreateMenuItem,
  useDeleteMenuItem,
  useMenuItems,
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
  const previewHref = `${WEB_URL}/vendors/${vendorSlug}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/menu" className="text-sm text-muted-foreground hover:underline">
            ← All menus
          </Link>
          <h1 className="text-2xl font-semibold">{menuName}</h1>
          <p className="text-sm text-muted-foreground">
            Reorder is coming soon - items are sorted by category, then name.
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items?.map((it) => (
          <ItemCard key={it.id} vendorId={vendorId} menuId={menuId} item={it} />
        ))}
      </div>
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

function ItemCard({
  vendorId,
  menuId,
  item,
}: {
  vendorId: string;
  menuId: string;
  item: MenuItem;
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
        {!item.isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-foreground">Unavailable</span>
          </div>
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
