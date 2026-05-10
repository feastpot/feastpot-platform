'use client';

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
} from '@feastpot/ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import {
  useCreateMenu,
  useDeleteMenu,
  useMenus,
  useUpdateMenu,
  type VendorMenu,
} from '@/hooks/use-menus';

export function MenuListClient({ vendorId }: { vendorId: string }) {
  const { data: menus, isLoading, error } = useMenus(vendorId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<VendorMenu | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Menus</h1>
          <p className="text-sm text-muted-foreground">Group your dishes into menus customers can browse.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add menu
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Could not load menus. {error instanceof Error ? error.message : ''}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading menus…</p>}

      {!isLoading && menus && menus.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground">You don&apos;t have any menus yet.</p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create your first menu
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {menus?.map((m) => (
          <MenuRow key={m.id} vendorId={vendorId} menu={m} onEdit={() => setEditing(m)} />
        ))}
      </div>

      {createOpen && (
        <CreateMenuDialog vendorId={vendorId} onClose={() => setCreateOpen(false)} />
      )}
      {editing && (
        <EditMenuDialog vendorId={vendorId} menu={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function MenuRow({
  vendorId,
  menu,
  onEdit,
}: {
  vendorId: string;
  menu: VendorMenu;
  onEdit: () => void;
}) {
  const update = useUpdateMenu(vendorId);
  const del = useDeleteMenu(vendorId);
  const { toast } = useToast();
  const itemCount = menu._count?.items ?? 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Link href={`/menu/${menu.id}`} className="font-medium hover:underline">
            {menu.name}
          </Link>
          <Badge variant={menu.isActive ? 'default' : 'secondary'}>
            {menu.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Active</span>
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
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit} className="gap-2">
            <Pencil className="h-4 w-4" /> Rename
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
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
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
