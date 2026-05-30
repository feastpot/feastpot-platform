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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from '@feastpot/ui';
import { ChevronDown, GripVertical, Pencil, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { MenuStatCards } from '@/components/menu/menu-stat-cards';
import { MenuSummaryRail } from '@/components/menu/menu-summary-rail';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import {
  useCreateMenu,
  useDeleteMenu,
  useMenus,
  useReorderMenus,
  useUpdateMenu,
  type VendorMenu,
} from '@/hooks/use-menus';

type SortKey = 'manual' | 'name_asc' | 'name_desc' | 'items_desc' | 'updated_desc';

const SORT_LABEL: Record<SortKey, string> = {
  manual: 'Custom order',
  name_asc: 'Name (A–Z)',
  name_desc: 'Name (Z–A)',
  items_desc: 'Most items',
  updated_desc: 'Recently updated',
};

/**
 * Menu list — redesigned to match the Vendor6 mockup while keeping
 * the original CRUD behaviour intact (create / rename / toggle
 * active / delete via the same hooks). The drag handle is rendered
 * for visual parity but reorder is not wired up yet — `useUpdateMenu`
 * already accepts `displayOrder` so add it in a future turn.
 *
 * Layout:
 *   [header — title + Add menu]
 *   [stat cards row]
 *   [search + sort toolbar]
 *   ┌────────────────────────────┬──────────────────────┐
 *   │ menu rows                  │ summary + tips rail  │
 *   └────────────────────────────┴──────────────────────┘
 *   [autosave footer note]
 */
export function MenuListClient({ vendorId }: { vendorId: string }) {
  const { data: menus, isLoading, error } = useMenus(vendorId);
  const reorder = useReorderMenus(vendorId);
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<VendorMenu | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('manual');

  const list = useMemo(() => {
    const all = menus ?? [];
    const needle = search.trim().toLowerCase();
    const filtered = needle ? all.filter((m) => m.name.toLowerCase().includes(needle)) : all.slice();
    // `manual` keeps the server's sortOrder (the array already arrives ordered),
    // so it's the only mode where drag-to-reorder maps cleanly back to the API.
    if (sort !== 'manual') {
      filtered.sort((a, b) => {
        switch (sort) {
          case 'name_asc':
            return a.name.localeCompare(b.name);
          case 'name_desc':
            return b.name.localeCompare(a.name);
          case 'items_desc':
            return (b._count?.items ?? 0) - (a._count?.items ?? 0);
          case 'updated_desc':
            return +new Date(b.updatedAt) - +new Date(a.updatedAt);
        }
      });
    }
    return filtered;
  }, [menus, search, sort]);

  // Dragging only makes sense over the FULL, unfiltered, custom-order list:
  // the reorder API requires every menu ID exactly once, so a searched or
  // re-sorted subset can't be persisted. Outside that mode rows aren't draggable.
  const canDrag = sort === 'manual' && search.trim() === '' && list.length > 1;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((m) => m.id === active.id);
    const newIndex = list.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const nextOrder = arrayMove(list, oldIndex, newIndex);
    reorder.mutate(
      nextOrder.map((m) => m.id),
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
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-dark">Menus</h1>
          <p className="mt-1 text-sm text-mid">Group your dishes into menus customers can browse.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-teal hover:bg-teal-dark">
          <Plus className="h-4 w-4" /> Add menu
        </Button>
      </header>

      <MenuStatCards menus={menus ?? []} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menus"
            aria-label="Search menus"
            className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-dark placeholder:text-mid focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-mid">
          <span>Sort by</span>
          <span className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-10 appearance-none rounded-lg border border-border bg-white pl-3 pr-8 text-sm font-semibold text-dark focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-mid"
              aria-hidden
            />
          </span>
        </label>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Could not load menus. {error instanceof Error ? error.message : ''}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-3">
          {isLoading && (
            <div className="fp-card border border-border bg-white p-6 text-center text-sm text-mid">
              Loading menus…
            </div>
          )}

          {!isLoading && menus && menus.length === 0 && (
            <div className="fp-card border border-border bg-white p-10 text-center">
              <p className="text-base font-semibold text-dark">You don&apos;t have any menus yet</p>
              <p className="mt-1 text-xs text-mid">Group your dishes into menus customers can browse.</p>
              <Button onClick={() => setCreateOpen(true)} className="mt-4 gap-2 bg-teal hover:bg-teal-dark">
                <Plus className="h-4 w-4" /> Create your first menu
              </Button>
            </div>
          )}

          {!isLoading && menus && menus.length > 0 && list.length === 0 && (
            <div className="fp-card border border-border bg-white p-8 text-center">
              <p className="text-sm font-semibold text-dark">No menus match your search</p>
              <p className="mt-1 text-xs text-mid">Try a different keyword or clear the search.</p>
            </div>
          )}

          {canDrag ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={list.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                {list.map((m) => (
                  <SortableMenuRow
                    key={m.id}
                    vendorId={vendorId}
                    menu={m}
                    onEdit={() => setEditing(m)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            list.map((m) => (
              <MenuRow key={m.id} vendorId={vendorId} menu={m} onEdit={() => setEditing(m)} />
            ))
          )}
        </div>

        <aside aria-label="Menu summary and tips">
          <MenuSummaryRail menus={menus ?? []} />
        </aside>
      </div>

      <div className="fp-card border border-border bg-surface px-4 py-3 text-center text-xs text-mid">
        Changes are saved automatically. Customers will only see published items.
      </div>

      {createOpen && <CreateMenuDialog vendorId={vendorId} onClose={() => setCreateOpen(false)} />}
      {editing && (
        <EditMenuDialog vendorId={vendorId} menu={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function SortableMenuRow({
  vendorId,
  menu,
  onEdit,
}: {
  vendorId: string;
  menu: VendorMenu;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: menu.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-70' : undefined}>
      <MenuRow
        vendorId={vendorId}
        menu={menu}
        onEdit={onEdit}
        handleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef }}
      />
    </div>
  );
}

function MenuRow({
  vendorId,
  menu,
  onEdit,
  handleProps,
}: {
  vendorId: string;
  menu: VendorMenu;
  onEdit: () => void;
  handleProps?: React.HTMLAttributes<HTMLButtonElement> & {
    ref: (node: HTMLElement | null) => void;
  };
}) {
  const update = useUpdateMenu(vendorId);
  const del = useDeleteMenu(vendorId);
  const { toast } = useToast();
  const itemCount = menu._count?.items ?? 0;
  const lastUpdated = new Date(menu.updatedAt);

  return (
    <article className="fp-card border border-border bg-white p-4">
      <div className="flex flex-wrap items-start gap-4">
        {handleProps && (
          <button
            type="button"
            {...handleProps}
            aria-label={`Drag to reorder ${menu.name}`}
            title="Drag to reorder"
            className="grid h-16 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-mid hover:bg-surface active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}
        {/* Thumbnail placeholder — the VendorMenu payload doesn't expose
            a cover image. Use a tinted tile with the dish icon so the
            row still has visual weight per the mockup. */}
        <span
          aria-hidden
          className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-teal-light text-teal"
        >
          <UtensilsCrossed className="h-7 w-7" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/menu/${menu.id}`}
              className="text-base font-bold text-dark hover:underline"
            >
              {menu.name}
            </Link>
            <Badge
              variant={menu.isActive ? 'default' : 'secondary'}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                menu.isActive ? 'bg-teal-light text-teal-dark' : 'bg-surface text-mid',
              )}
            >
              {menu.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-mid">
            <span className="font-semibold tabular-nums text-dark">{itemCount}</span>{' '}
            {itemCount === 1 ? 'item' : 'items'}
            <span className="mx-1.5 text-border">•</span>
            Last updated {lastUpdated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The status badge above already shows Active/Inactive,
              so the switch gets a static "Visible" label to describe
              what flipping it does rather than restating the state. */}
          <label className="flex items-center gap-2 text-xs text-mid">
            <span className="font-semibold text-dark">Visible</span>
            <Switch
              checked={menu.isActive}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                update.mutate(
                  { menuId: menu.id, isActive: checked },
                  {
                    onError: (err) =>
                      toast({
                        title: 'Could not update menu',
                        description: err instanceof Error ? err.message : 'Try again',
                        variant: 'destructive',
                      }),
                  },
                )
              }
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="gap-1.5 text-teal hover:bg-teal-light/40 hover:text-teal-dark"
          >
            <Pencil className="h-3.5 w-3.5" /> Rename
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={itemCount > 0 || del.isPending}
            title={itemCount > 0 ? 'Remove all items first' : 'Delete menu'}
            onClick={() => {
              if (!confirm(`Delete menu "${menu.name}"? This cannot be undone.`)) return;
              del.mutate(menu.id, {
                onError: (err) =>
                  toast({
                    title: 'Could not delete menu',
                    description: err instanceof Error ? err.message : 'Try again',
                    variant: 'destructive',
                  }),
              });
            }}
            className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
    </article>
  );
}

function CreateMenuDialog({ vendorId, onClose }: { vendorId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const create = useCreateMenu(vendorId);
  const { toast } = useToast();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New menu</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) return;
            create.mutate(
              { name: name.trim() },
              {
                onSuccess: () => {
                  toast({ title: 'Menu created' });
                  onClose();
                },
                onError: (err) =>
                  toast({
                    title: 'Could not create menu',
                    description: err instanceof Error ? err.message : '',
                    variant: 'destructive',
                  }),
              },
            );
          }}
        >
          <Input
            placeholder="Menu name (e.g. Sunday Specials)"
            value={name}
            minLength={2}
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMenuDialog({
  vendorId,
  menu,
  onClose,
}: {
  vendorId: string;
  menu: VendorMenu;
  onClose: () => void;
}) {
  const [name, setName] = useState(menu.name);
  const update = useUpdateMenu(vendorId);
  const { toast } = useToast();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename menu</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(
              { menuId: menu.id, name: name.trim() },
              {
                onSuccess: () => {
                  toast({ title: 'Menu updated' });
                  onClose();
                },
                onError: (err) =>
                  toast({
                    title: 'Could not update menu',
                    description: err instanceof Error ? err.message : '',
                    variant: 'destructive',
                  }),
              },
            );
          }}
        >
          <Input value={name} minLength={2} maxLength={255} onChange={(e) => setName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending || name.trim().length < 2}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
