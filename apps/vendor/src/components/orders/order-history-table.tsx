'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { format } from 'date-fns';
import { useState } from 'react';

import { useOrderHistory, type VendorOrder, type VendorOrderStatus } from '@/hooks/use-vendor-orders';

const HISTORY_STATUSES: VendorOrderStatus[] = ['delivered', 'cancelled', 'refunded', 'rejected'];

function pounds(pence: number) {
  return (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

export function OrderHistoryTable() {
  const [status, setStatus] = useState<VendorOrderStatus>('delivered');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<VendorOrder | null>(null);

  const { data, isLoading, isError } = useOrderHistory({
    status,
    cursor: cursors[page],
  });

  function gotoNext() {
    if (!data?.nextCursor) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[page + 1] = data.nextCursor!;
      return copy;
    });
    setPage((p) => p + 1);
  }

  function gotoPrev() {
    setPage((p) => Math.max(0, p - 1));
  }

  function changeStatus(next: VendorOrderStatus) {
    setStatus(next);
    setCursors([undefined]);
    setPage(0);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base">Order history</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => changeStatus(v as VendorOrderStatus)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HISTORY_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {isError && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-destructive">
                    Failed to load history.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !isError && data?.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No {status} orders yet.
                  </TableCell>
                </TableRow>
              )}
              {data?.data.map((order) => {
                const itemsCount = order.items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(order.createdAt), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell>{order.customer?.firstName ?? '-'}</TableCell>
                    <TableCell>{itemsCount} item{itemsCount === 1 ? '' : 's'}</TableCell>
                    <TableCell className="text-right">{pounds(order.totalPence)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(order)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page + 1}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={gotoPrev}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!data?.nextCursor} onClick={gotoNext}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order {selected?.orderNumber}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span>{selected.customer?.firstName ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Placed</span>
                <span>{format(new Date(selected.createdAt), 'd MMM yyyy HH:mm')}</span>
              </div>
              <div>
                <div className="mb-1 text-muted-foreground">Items</div>
                <ul className="space-y-1">
                  {selected.items.map((it) => (
                    <li key={it.id} className="flex justify-between">
                      <span>{it.quantity}× {(it as Record<string, unknown>).itemName as string ?? 'Item'}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total</span>
                <span>{pounds(selected.totalPence)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>You received</span>
                <span>{pounds(selected.vendorPayoutPence)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
