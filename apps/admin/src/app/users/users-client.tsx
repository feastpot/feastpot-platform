'use client';

import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  UserSearch,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  useAdminUsersList,
  useCreateStaffUser,
  useExportUser,
  useIssueCredit,
  useReinstateUser,
  useSuspendUser,
  useUpdateUserRole,
  type AdminUserRole,
  type AdminUserRow,
  type AdminUserStatus,
  type JoinedRange,
  type StaffRoleValue,
} from '@/hooks/use-admin-users';
import { formatDate, formatPence } from '@/lib/format';

const PAGE_LIMIT = 25;

const ROLE_OPTIONS: ReadonlyArray<{ value: AdminUserRole | 'all'; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'customer', label: 'Customer' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'admin', label: 'Admin' },
  { value: 'support', label: 'Support' },
  { value: 'finance', label: 'Finance' },
  { value: 'compliance', label: 'Compliance' },
];

// Staff-only roles the admin Users page can create or assign. Customer/
// vendor accounts are provisioned by other flows and intentionally
// excluded so we don't fabricate a dangling Vendor row.
const STAFF_ROLE_OPTIONS: ReadonlyArray<{ value: StaffRoleValue; label: string; description: string }> = [
  { value: 'admin', label: 'Admin', description: 'Full access including user management and audit log.' },
  { value: 'support', label: 'Support', description: 'View users + orders, issue order overrides.' },
  { value: 'finance', label: 'Finance', description: 'View orders + payouts, issue goodwill credit.' },
  { value: 'compliance', label: 'Compliance', description: 'Review vendor documents, run DSAR exports.' },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: AdminUserStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deleted', label: 'Deleted' },
];

const JOINED_OPTIONS: ReadonlyArray<{ value: JoinedRange | 'all'; label: string }> = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'year', label: 'Past year' },
];

const ROLE_TONE: Record<AdminUserRole, StatusTone> = {
  customer: 'brand',
  vendor: 'info',
  admin: 'neutral',
  support: 'neutral',
  finance: 'neutral',
  compliance: 'neutral',
};

const STATUS_TONE: Record<AdminUserStatus, StatusTone> = {
  active: 'success',
  suspended: 'danger',
  deleted: 'neutral',
};

const DEFAULT_FILTERS = {
  q: '',
  role: 'all' as AdminUserRole | 'all',
  status: 'all' as AdminUserStatus | 'all',
  joined: 'all' as JoinedRange | 'all',
};

interface UsersClientProps {
  currentUserId: string;
  role: 'admin' | 'support' | 'finance' | 'compliance';
}

export function UsersClient({ currentUserId, role }: UsersClientProps) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  const canManageUsers = role === 'admin';
  // Track cursor history so prev-page is just a pop. We don't refetch
  // count between pages — total comes back unchanged with each query.
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const pageIndex = cursorStack.length - 1;

  const list = useAdminUsersList({ ...filters, cursor, limit: PAGE_LIMIT });
  const rows = list.data?.data ?? [];
  // Total recomputed by the server on every page (cheap COUNT). If rows are
  // inserted/deleted between fetches the displayed range may drift by a few
  // — acceptable for an admin tool, and clamped below so we never show
  // "showingTo > total".
  const total = list.data?.total ?? 0;
  const nextCursor = list.data?.nextCursor ?? null;

  const hasActiveFilters = useMemo(
    () =>
      filters.q.trim().length > 0 ||
      filters.role !== 'all' ||
      filters.status !== 'all' ||
      filters.joined !== 'all',
    [filters],
  );

  function updateFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setCursorStack([null]);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setCursorStack([null]);
  }

  function nextPage() {
    if (!nextCursor) return;
    setCursorStack((s) => [...s, nextCursor]);
  }

  function prevPage() {
    if (cursorStack.length <= 1) return;
    setCursorStack((s) => s.slice(0, -1));
  }

  const showingFrom = rows.length === 0 ? 0 : pageIndex * PAGE_LIMIT + 1;
  const showingTo = rows.length === 0 ? 0 : Math.min(pageIndex * PAGE_LIMIT + rows.length, total);
  const rangeLabel = showingFrom === showingTo ? `${showingTo}` : `${showingFrom}–${showingTo}`;

  return (
    <>
      <PageHeader
        title="Users"
        description="Look up a customer, issue credit, suspend or export their data."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={!canManageUsers}
            title={canManageUsers ? 'Invite a new staff user' : 'Only admins can create users'}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add user
          </Button>
        }
      />

      {canManageUsers && (
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={() => list.refetch()}
        />
      )}

      {/* Search row */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by email or name…"
              value={filters.q}
              onChange={(e) => updateFilter('q', e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" disabled title="Filters are inline below">
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
          <Button
            variant="ghost"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="text-muted-foreground"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </CardContent>
      </Card>

      {/* Filter row */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4 py-3">
          <FilterControl label="Role">
            <Select value={filters.role} onValueChange={(v) => updateFilter('role', v as AdminUserRole | 'all')}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterControl>

          <FilterControl label="Status">
            <Select value={filters.status} onValueChange={(v) => updateFilter('status', v as AdminUserStatus | 'all')}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterControl>

          <FilterControl label="Joined">
            <Select value={filters.joined} onValueChange={(v) => updateFilter('joined', v as JoinedRange | 'all')}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOINED_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterControl>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              disabled={total === 0}
              title={total === 0 ? 'No users to export' : 'Export current filter as CSV (coming soon)'}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => list.refetch()}
              disabled={list.isFetching}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${list.isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error banner */}
      {list.error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load users: {(list.error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Total spent</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!list.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={UserSearch}
                      title="No users found"
                      description="Try adjusting your search or filters to find what you're looking for."
                      action={
                        hasActiveFilters ? (
                          <Button onClick={clearFilters}>Clear filters</Button>
                        ) : null
                      }
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  currentUserId={currentUserId}
                  viewerRole={role}
                  onChange={() => list.refetch()}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {/* Footer pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Showing {total === 0 ? 0 : rangeLabel} of {total} {total === 1 ? 'user' : 'users'}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={prevPage}
              disabled={pageIndex === 0 || list.isFetching}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="grid h-8 min-w-8 place-items-center rounded-md bg-brand px-2 text-xs font-semibold text-brand-foreground">
              {pageIndex + 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={nextPage}
              disabled={!nextCursor || list.isFetching}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

function FilterControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function UserRow({
  user,
  currentUserId,
  viewerRole,
  onChange,
}: {
  user: AdminUserRow;
  currentUserId: string;
  viewerRole: 'admin' | 'support' | 'finance' | 'compliance';
  onChange: () => void;
}) {
  const [creditOpen, setCreditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const exportUser = useExportUser();
  const reinstate = useReinstateUser(user.id, { onSuccess: onChange });

  const initials =
    `${(user.firstName ?? user.email)[0] ?? '?'}${(user.lastName ?? '')[0] ?? ''}`.toUpperCase();
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  const isSelf = user.id === currentUserId;

  const canCredit = viewerRole === 'admin' || viewerRole === 'finance';
  const canSuspend = viewerRole === 'admin';
  const canExport = viewerRole === 'admin' || viewerRole === 'compliance';
  // Role changes are admin-only, never on yourself, and never on vendor
  // accounts (their Vendor row would dangle — backend also rejects this).
  const canChangeRole = viewerRole === 'admin' && !isSelf && user.role !== 'vendor';

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-light text-xs font-bold text-teal-dark">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="font-medium leading-tight">{fullName}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <StatusPill tone={ROLE_TONE[user.role]} withDot={false}>
            {user.role}
          </StatusPill>
        </TableCell>
        <TableCell>
          <StatusPill tone={STATUS_TONE[user.status]}>{user.status}</StatusPill>
        </TableCell>
        <TableCell className="text-sm">{formatDate(user.createdAt)}</TableCell>
        <TableCell className="text-right tabular-nums">{user.orderCount}</TableCell>
        <TableCell className="text-right tabular-nums">{formatPence(user.lifetimeSpendPence)}</TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="User actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canChangeRole && (
                <DropdownMenuItem onSelect={() => setRoleOpen(true)}>
                  Change role…
                </DropdownMenuItem>
              )}
              {canCredit && (
                <DropdownMenuItem onSelect={() => setCreditOpen(true)}>
                  Issue credit
                </DropdownMenuItem>
              )}
              {canSuspend && user.status === 'active' && (
                <DropdownMenuItem
                  onSelect={() => setSuspendOpen(true)}
                  disabled={isSelf}
                  className="text-destructive focus:text-destructive"
                >
                  Suspend
                </DropdownMenuItem>
              )}
              {canSuspend && user.status === 'suspended' && (
                <DropdownMenuItem onSelect={() => reinstate.mutate()} disabled={reinstate.isPending}>
                  {reinstate.isPending ? 'Reinstating…' : 'Reinstate'}
                </DropdownMenuItem>
              )}
              {canExport && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void exportUser(user.id)}>
                    Export data (DSAR)
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

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
      {canChangeRole && (
        <ChangeRoleDialog
          userId={user.id}
          currentRole={user.role}
          displayName={fullName}
          open={roleOpen}
          onOpenChange={setRoleOpen}
          onSuccess={onChange}
        />
      )}
    </>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRoleValue>('support');
  const [sendInvite, setSendInvite] = useState(true);

  const mutation = useCreateStaffUser({
    onSuccess: () => {
      setEmail('');
      setFirstName('');
      setLastName('');
      setStaffRole('support');
      setSendInvite(true);
      onOpenChange(false);
      onSuccess();
    },
  });

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const valid = emailValid && firstName.trim().length > 0 && lastName.trim().length > 0;
  const roleMeta = STAFF_ROLE_OPTIONS.find((o) => o.value === staffRole);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a staff user</DialogTitle>
          <DialogDescription>
            Creates a Supabase account and emails a magic link so they can set a password and sign in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">First name</span>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ada"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Last name</span>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Lovelace"
                autoComplete="off"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Work email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ada@feastpot.co.uk"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Role</span>
            <Select value={staffRole} onValueChange={(v) => setStaffRole(v as StaffRoleValue)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roleMeta && (
              <span className="mt-1 block text-xs text-muted-foreground">{roleMeta.description}</span>
            )}
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Email a magic-link invite now</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Uncheck if you&apos;ll share the link manually — the account is still created either way.
              </span>
            </span>
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
            onClick={() =>
              mutation.mutate({
                email: email.trim(),
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                role: staffRole,
                sendInvite,
              })
            }
          >
            {mutation.isPending ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleDialog({
  userId,
  currentRole,
  displayName,
  open,
  onOpenChange,
  onSuccess,
}: {
  userId: string;
  currentRole: AdminUserRole;
  displayName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  // Default to current role only if it's a staff role; otherwise default
  // to 'support' so the Select doesn't show "customer" (not in the list).
  const initialRole: StaffRoleValue =
    currentRole === 'admin' || currentRole === 'support' || currentRole === 'finance' || currentRole === 'compliance'
      ? currentRole
      : 'support';
  const [newRole, setNewRole] = useState<StaffRoleValue>(initialRole);
  const [reason, setReason] = useState('');

  const mutation = useUpdateUserRole(userId, {
    onSuccess: () => {
      setReason('');
      onOpenChange(false);
      onSuccess();
    },
  });

  const unchanged = newRole === currentRole;
  const reasonValid = reason.trim().length >= 10;
  const valid = !unchanged && reasonValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Update {displayName}&apos;s role. The change is audited and they&apos;ll be signed out everywhere so the new permissions take effect on next sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Current role:</span>{' '}
            <span className="font-medium capitalize">{currentRole}</span>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">New role</span>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as StaffRoleValue)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} disabled={o.value === currentRole}>
                    {o.label}
                    {o.value === currentRole ? ' (current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Reason (audited, min 10 chars)</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Promoted to finance team lead"
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
            onClick={() => mutation.mutate({ role: newRole, reason: reason.trim() })}
          >
            {mutation.isPending ? 'Saving…' : 'Change role'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
            Credit is added 1:1 to the customer&apos;s loyalty balance and applied at checkout.
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
              placeholder="Goodwill - late delivery"
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
            {mutation.isPending ? 'Issuing…' : `Issue ${formatPence(amountPence || 0)}`}
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
