'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
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
import { Download, Pencil, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import {
  useAdminUserSearch,
  useExportUser,
  useIssueCredit,
  useOverrideOrderStatus,
  useReinstateUser,
  useSuspendUser,
  type AdminUserDetail,
  type AdminUserOrderRow,
  type OrderStatus,
} from '@/hooks/use-admin-users';
import { ApiError } from '@/lib/api/client';
import { formatDate, formatDateTime, formatPence } from '@/lib/format';

const ORDER_STATUSES: ReadonlyArray<OrderStatus> = [
  'pending',
  'accepted',
  'preparing',
  'dispatched',
  'delivered',
  'cancelled',
  'refunded',
];

interface UsersClientProps {
  currentUserId: string;
  role: 'admin' | 'support' | 'finance' | 'compliance';
}

export function UsersClient({ currentUserId, role }: UsersClientProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState('');
  const search = useAdminUserSearch(submitted);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(email.trim());
    setTimeout(() => search.refetch(), 0);
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Look up a customer, issue credit, suspend or export their data."
      />

      <Card className="mb-6">
        <CardContent className="py-4">
          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="max-w-md"
            />
            <Button type="submit" disabled={!email.trim() || search.isFetching}>
              <Search className="mr-2 h-4 w-4" />
              {search.isFetching ? 'Searching…' : 'Search'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {search.error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            {search.error instanceof ApiError && search.error.status === 404
              ? 'No user found with that email.'
              : `Search failed: ${(search.error as Error).message}`}
          </CardContent>
        </Card>
      )}

      {search.data && (
        <UserDetailCard
          user={search.data}
          currentUserId={currentUserId}
          role={role}
          onChange={() => search.refetch()}
        />
      )}
    </>
  );
}

function UserDetailCard({
  user,
  currentUserId,
  role,
  onChange,
}: {
  user: AdminUserDetail;
  currentUserId: string;
  role: 'admin' | 'support' | 'finance' | 'compliance';
  onChange: () => void;
}) {
  const [creditOpen, setCreditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const exportUser = useExportUser();
  const reinstate = useReinstateUser(user.id, { onSuccess: onChange });

  const initials =
    `${(user.firstName ?? '?')[0] ?? '?'}${(user.lastName ?? '')[0] ?? ''}`.toUpperCase();
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  const isSelf = user.id === currentUserId;

  const canCredit = role === 'admin' || role === 'finance';
  const canSuspend = role === 'admin';
  const canExport = role === 'admin' || role === 'compliance';

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-vendor-light text-lg font-semibold text-vendor-dark">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{fullName}</h2>
              <Badge variant="outline">{user.role}</Badge>
              <Badge variant={user.status === 'active' ? 'secondary' : 'destructive'}>
                {user.status}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Member since {formatDate(user.createdAt)} · {user.orderCount} orders ·{' '}
              {formatPence(user.lifetimeSpendPence)} lifetime · ⭐ {user.loyaltyBalance.toLocaleString()} pts
            </div>
            {user.vendor && (
              <div className="mt-2 text-xs">
                <Link
                  href={`/vendors/${user.vendor.id}`}
                  className="text-vendor underline-offset-2 hover:underline"
                >
                  Also a vendor: {user.vendor.businessName} ({user.vendor.status})
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canCredit && (
            <Button size="sm" onClick={() => setCreditOpen(true)}>
              Issue credit
            </Button>
          )}
          {canSuspend && user.status === 'active' && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setSuspendOpen(true)}
              disabled={isSelf}
              title={isSelf ? "You can't suspend yourself" : undefined}
            >
              Suspend
            </Button>
          )}
          {canSuspend && user.status === 'suspended' && (
            <Button size="sm" variant="outline" onClick={() => reinstate.mutate()} disabled={reinstate.isPending}>
              {reinstate.isPending ? 'Reinstating…' : 'Reinstate'}
            </Button>
          )}
          {canExport && (
            <Button size="sm" variant="outline" onClick={() => exportUser(user.id)}>
              <Download className="mr-2 h-4 w-4" />
              Export DSAR
            </Button>
          )}
        </div>

        <h3 className="mt-6 text-sm font-semibold">Recent orders</h3>
        <div className="mt-2 overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              )}
              {user.orders.map((o) => (
                <OrderRow key={o.id} order={o} canOverride={role === 'admin' || role === 'support'} onChange={onChange} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {canCredit && (
        <IssueCreditDialog
          userId={user.id}
          open={creditOpen}
          onOpenChange={setCreditOpen}
          onSuccess={onChange}
        />
      )}
      {canSuspend && (
        <SuspendDialog
          userId={user.id}
          open={suspendOpen}
          onOpenChange={setSuspendOpen}
          onSuccess={onChange}
        />
      )}
    </Card>
  );
}

function OrderRow({
  order,
  canOverride,
  onChange,
}: {
  order: AdminUserOrderRow;
  canOverride: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [reason, setReason] = useState('');
  const override = useOverrideOrderStatus({
    onSuccess: () => {
      setEditing(false);
      setReason('');
      onChange();
    },
  });

  const itemSummary = order.items.map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(', ');

  return (
    <>
      <TableRow>
        <TableCell className="text-xs">{formatDateTime(order.createdAt)}</TableCell>
        <TableCell>{order.vendor.businessName}</TableCell>
        <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={itemSummary}>
          {itemSummary || '—'}
        </TableCell>
        <TableCell className="text-right">{formatPence(order.totalPence)}</TableCell>
        <TableCell>
          <Badge variant="outline">{order.status}</Badge>
        </TableCell>
        <TableCell className="text-right">
          {canOverride && (
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {editing && canOverride && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <div className="flex flex-wrap items-center gap-2 py-2">
              <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Reason for override (audited)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="max-w-md"
              />
              <Button
                size="sm"
                disabled={!reason.trim() || status === order.status || override.isPending}
                onClick={() =>
                  override.mutate({ orderId: order.id, status, reason: reason.trim() })
                }
              >
                {override.isPending ? 'Saving…' : 'Apply'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              {override.error && (
                <span className="text-xs text-destructive">
                  {(override.error as Error).message}
                </span>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function IssueCreditDialog({
  userId,
  open,
  onOpenChange,
  onSuccess,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [pounds, setPounds] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useIssueCredit(userId, {
    onSuccess: () => {
      setPounds('');
      setReason('');
      onOpenChange(false);
      onSuccess();
    },
  });

  const amountPence = Math.round(Number(pounds) * 100);
  const valid = amountPence > 0 && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue credit</DialogTitle>
          <DialogDescription>
            Credit is added 1:1 to the customer's loyalty balance and applied at checkout.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Amount (£)</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={pounds}
              onChange={(e) => setPounds(e.target.value)}
              placeholder="10.00"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Reason (audited)</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Goodwill — late delivery"
            />
          </label>
          {mutation.error && (
            <p className="text-xs text-destructive">{(mutation.error as Error).message}</p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate({ amountPence, reason: reason.trim() })}
          >
            {mutation.isPending ? 'Issuing…' : `Issue ${formatPence(amountPence)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SuspendDialog({
  userId,
  open,
  onOpenChange,
  onSuccess,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const mutation = useSuspendUser(userId, {
    onSuccess: () => {
      setReason('');
      onOpenChange(false);
      onSuccess();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend user</DialogTitle>
          <DialogDescription>
            This revokes all auth sessions globally and blocks future API requests until reinstated.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for suspension"
        />
        {mutation.error && (
          <p className="mt-2 text-xs text-destructive">{(mutation.error as Error).message}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ reason: reason.trim() })}
          >
            {mutation.isPending ? 'Suspending…' : 'Confirm suspend'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
