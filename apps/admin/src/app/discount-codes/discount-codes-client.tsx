'use client';

import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { AlertTriangle, CalendarClock, MoreHorizontal, Percent, Plus, Tag } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import {
  useCreateDiscountCode,
  useDiscountCodes,
  useToggleDiscountCode,
  useUpdateDiscountCodeFundedBy,
  type CreateDiscountCodeInput,
  type DiscountCodeRow,
  type DiscountFundedBy,
  type DiscountType,
} from '@/hooks/use-discount-codes';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';

interface Props {
  canCreate: boolean;
}

const EMPTY_FORM: CreateDiscountCodeInput = {
  code: '',
  type: 'flat',
  value: 0,
  minOrderPence: 0,
  isActive: true,
  fundedBy: 'PLATFORM',
};

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'confirm-vendor-create'; payload: CreateDiscountCodeInput; vendorName: string }
  | { kind: 'change-funding'; row: DiscountCodeRow };

/**
 * Admin discount-code console. Finance can view + see redemption stats;
 * only `admin` can mint new codes or toggle active status , the server
 * also enforces this; the prop is just used to hide the buttons.
 */
export function DiscountCodesClient({ canCreate }: Props) {
  const { toast } = useToast();
  const { data, isLoading, error } = useDiscountCodes(1);
  const create = useCreateDiscountCode();
  const toggle = useToggleDiscountCode();
  const updateFundedBy = useUpdateDiscountCodeFundedBy();

  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [form, setForm] = useState<CreateDiscountCodeInput>(EMPTY_FORM);

  function update<K extends keyof CreateDiscountCodeInput>(
    key: K,
    value: CreateDiscountCodeInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialog({ kind: 'create' });
  }

  function closeDialog() {
    setDialog({ kind: 'closed' });
  }

  /** Step 1: validate locally; if VENDOR-funded show confirmation, else create immediately. */
  function handleCreateSubmit() {
    const payload: CreateDiscountCodeInput = {
      ...form,
      code: form.code.trim().toUpperCase(),
      minOrderPence: form.minOrderPence || 0,
      maxUses: form.maxUses && form.maxUses > 0 ? form.maxUses : undefined,
      expiresAt: form.expiresAt || undefined,
    };

    if (payload.fundedBy === 'VENDOR') {
      // Resolve vendor name from the loaded rows (best-effort) for the confirmation copy.
      const rows = data?.data ?? [];
      const vendorName =
        rows.find((r) => r.vendorId === payload.vendorId)?.vendor?.businessName ??
        payload.vendorId ??
        'the selected vendor';
      setDialog({ kind: 'confirm-vendor-create', payload, vendorName });
    } else {
      void doCreate(payload);
    }
  }

  async function doCreate(payload: CreateDiscountCodeInput) {
    try {
      await create.mutateAsync(payload);
      toast({ title: 'Discount code created', description: payload.code });
      setForm(EMPTY_FORM);
      setDialog({ kind: 'closed' });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to create discount code';
      toast({ title: 'Could not create code', description: msg, variant: 'destructive' });
      setDialog({ kind: 'create' }); // return to form on error so admin can fix
    }
  }

  async function onToggle(id: string, isActive: boolean) {
    try {
      await toggle.mutateAsync({ id, isActive });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to update code';
      toast({ title: 'Update failed', description: msg, variant: 'destructive' });
    }
  }

  async function onChangeFunding(id: string, fundedBy: DiscountFundedBy) {
    try {
      await updateFundedBy.mutateAsync({ id, fundedBy });
      toast({ title: 'Funding source updated' });
      setDialog({ kind: 'closed' });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to update funding source';
      toast({ title: 'Update failed', description: msg, variant: 'destructive' });
    }
  }

  const rows = data?.data ?? [];
  const colSpan = canCreate ? 10 : 9;
  const isVendorFunded = form.fundedBy === 'VENDOR';

  const isCreateFormValid =
    !!form.code.trim() &&
    !!form.value &&
    (!isVendorFunded || !!form.vendorId?.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discount codes"
        description="Promotional codes redeemed at customer checkout."
        actions={
          canCreate ? (
            <Button onClick={openCreate} className="bg-emerald-700 hover:bg-emerald-800">
              <Plus className="mr-1.5 h-4 w-4" />
              New code
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {error instanceof ApiError ? error.message : 'Failed to load discount codes'}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="uppercase tracking-wide text-xs">Code</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Type</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Value</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Min order</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Used</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Expires</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Vendor</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Funded by</TableHead>
                <TableHead className="uppercase tracking-wide text-xs">Status</TableHead>
                {canCreate ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="p-0">
                    <EmptyState
                      icon={Tag}
                      title="No discount codes yet"
                      description={
                        canCreate
                          ? 'Create your first promotional code to offer discounts and boost customer engagement.'
                          : 'When admins mint promotional codes, they will appear here.'
                      }
                      action={
                        canCreate ? (
                          <Button
                            onClick={openCreate}
                            className="bg-emerald-700 hover:bg-emerald-800"
                          >
                            <Plus className="mr-1.5 h-4 w-4" />
                            Create your first code
                          </Button>
                        ) : undefined
                      }
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <DiscountRow
                    key={r.id}
                    row={r}
                    canCreate={canCreate}
                    toggling={toggle.isPending}
                    onToggle={onToggle}
                    onChangeFunding={(row) => setDialog({ kind: 'change-funding', row })}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Create dialog ── */}
      <Dialog open={dialog.kind === 'create'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New discount code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Code">
              <Input
                value={form.code}
                onChange={(e) => update('code', e.target.value.toUpperCase())}
                placeholder="WELCOME10"
                maxLength={30}
              />
            </Field>

            <Field label="Type">
              <div className="flex gap-2">
                {(['flat', 'percentage'] as DiscountType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update('type', t)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                      form.type === t
                        ? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-800'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    {t === 'flat' ? 'Flat (pence off)' : 'Percentage (basis points)'}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Value"
              hint={
                form.type === 'flat'
                  ? 'Pence , e.g. 500 = £5 off'
                  : 'Basis points , e.g. 1000 = 10% off, 500 = 5%'
              }
            >
              <Input
                type="number"
                min={1}
                value={form.value || ''}
                onChange={(e) => update('value', Number(e.target.value))}
              />
            </Field>

            <Field label="Minimum order (pence, optional)">
              <Input
                type="number"
                min={0}
                value={form.minOrderPence || ''}
                onChange={(e) => update('minOrderPence', Number(e.target.value))}
              />
            </Field>

            <Field label="Max uses (optional , blank = unlimited)">
              <Input
                type="number"
                min={1}
                value={form.maxUses || ''}
                onChange={(e) =>
                  update('maxUses', e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </Field>

            <Field label="Expires at (optional)">
              <Input
                type="datetime-local"
                value={form.expiresAt ?? ''}
                onChange={(e) =>
                  update(
                    'expiresAt',
                    e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  )
                }
              />
            </Field>

            {/* Funding source , the highest-stakes field in this form */}
            <Field label="Who funds this discount?">
              <div className="space-y-2">
                <FundingOption
                  selected={form.fundedBy === 'PLATFORM'}
                  onSelect={() => update('fundedBy', 'PLATFORM')}
                  title="Feastpot funds this"
                  description="The vendor is paid in full. The discount comes out of Feastpot's commission."
                  tone="safe"
                />
                <FundingOption
                  selected={form.fundedBy === 'VENDOR'}
                  onSelect={() => update('fundedBy', 'VENDOR')}
                  title="The vendor funds this"
                  description="The discount comes off the vendor's payout. Commission is calculated on the discounted amount. The vendor must be specified below."
                  tone="warn"
                />
              </div>
            </Field>

            <Field
              label={isVendorFunded ? 'Vendor ID (required for vendor-funded codes)' : 'Vendor ID (optional , blank = all vendors)'}
            >
              <Input
                value={form.vendorId ?? ''}
                onChange={(e) => update('vendorId', e.target.value || undefined)}
                placeholder="UUID"
                className={isVendorFunded && !form.vendorId ? 'border-amber-400 ring-amber-200' : ''}
              />
              {isVendorFunded && !form.vendorId ? (
                <p className="text-xs text-amber-700">
                  A vendor-funded code must be scoped to a specific vendor , a platform-wide code
                  cannot bill every cook for one promotion.
                </p>
              ) : null}
            </Field>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={create.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateSubmit}
                disabled={create.isPending || !isCreateFormValid}
                className={isVendorFunded ? 'bg-amber-600 hover:bg-amber-700' : ''}
              >
                {create.isPending ? 'Creating…' : isVendorFunded ? 'Review & confirm…' : 'Create code'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Vendor-funded confirmation step ── */}
      {dialog.kind === 'confirm-vendor-create' && (
        <Dialog open onOpenChange={(o) => !o && setDialog({ kind: 'create' })}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
                Confirm vendor-funded code
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <strong>{dialog.vendorName}</strong> will bear the cost of this discount.
                Every time code <strong className="font-mono">{dialog.payload.code}</strong> is
                redeemed, the discount amount is deducted from their payout , and commission is
                calculated on the lower, discounted total.
              </div>
              <p className="text-sm text-muted-foreground">
                If this vendor has not agreed to fund this promotion, choose{' '}
                <strong>Cancel</strong> and switch the funding source to Feastpot instead.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialog({ kind: 'create' })}>
                  Cancel
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={create.isPending}
                  onClick={() => void doCreate(dialog.payload)}
                >
                  {create.isPending ? 'Creating…' : 'Yes, create vendor-funded code'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Change funding source dialog ── */}
      {dialog.kind === 'change-funding' && (
        <ChangeFundingDialog
          row={dialog.row}
          onClose={closeDialog}
          onConfirm={onChangeFunding}
          isPending={updateFundedBy.isPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DiscountRow({
  row: r,
  canCreate,
  toggling,
  onToggle,
  onChangeFunding,
}: {
  row: DiscountCodeRow;
  canCreate: boolean;
  toggling: boolean;
  onToggle: (id: string, isActive: boolean) => void;
  onChangeFunding: (row: DiscountCodeRow) => void;
}) {
  const valueLabel =
    r.type === 'flat' ? `${formatPence(r.value)} off` : `${stripTrailingZeros(r.value / 100)}% off`;

  const usedPct =
    r.maxUses && r.maxUses > 0 ? Math.min(100, Math.round((r.usedCount / r.maxUses) * 100)) : null;

  const canChangeFunding = r.usedCount === 0;

  return (
    <TableRow>
      <TableCell>
        <div className="font-mono text-sm font-semibold tracking-wide">{r.code}</div>
        <div className="text-xs text-muted-foreground">
          {r.vendor ? `${r.vendor.businessName} offer` : 'Platform offer'}
        </div>
      </TableCell>

      <TableCell>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
            r.type === 'percentage' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
          }`}
        >
          {r.type === 'percentage' ? <Percent className="h-3 w-3" /> : null}
          {r.type === 'percentage' ? 'Percentage' : 'Flat'}
        </span>
      </TableCell>

      <TableCell className="text-sm font-medium">{valueLabel}</TableCell>

      <TableCell className="text-sm">
        {r.minOrderPence ? formatPence(r.minOrderPence) : '-'}
      </TableCell>

      <TableCell>
        <div className="text-sm font-medium">
          {r.usedCount}
          {r.maxUses ? ` / ${r.maxUses}` : ''}
        </div>
        {usedPct !== null ? (
          <div
            className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={r.usedCount}
            aria-valuemin={0}
            aria-valuemax={r.maxUses ?? undefined}
            aria-label={`${r.usedCount} of ${r.maxUses} redemptions used`}
          >
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${usedPct}%` }} />
          </div>
        ) : null}
      </TableCell>

      <TableCell>
        {r.expiresAt ? (
          <div className="flex items-start gap-1.5">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
            <div className="leading-tight">
              <div className="text-sm">{formatExpiryDate(r.expiresAt)}</div>
              <div className="text-xs text-muted-foreground">{formatExpiryTime(r.expiresAt)}</div>
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Never</span>
        )}
      </TableCell>

      <TableCell>
        <div className="text-sm">{r.vendor?.businessName ?? 'All vendors'}</div>
      </TableCell>

      {/* Funded-by: the source of truth for who bears the discount cost */}
      <TableCell>
        <FundedByPill fundedBy={r.fundedBy} />
      </TableCell>

      <TableCell>
        <StatusPill tone={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? 'Active' : 'Disabled'}
        </StatusPill>
      </TableCell>

      {canCreate ? (
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Row actions" disabled={toggling}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onToggle(r.id, !r.isActive)}>
                {r.isActive ? 'Disable code' : 'Enable code'}
              </DropdownMenuItem>
              {canChangeFunding ? (
                <DropdownMenuItem onSelect={() => onChangeFunding(r)}>
                  Change funding source
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard?.writeText(r.code);
                }}
              >
                Copy code
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function FundedByPill({ fundedBy }: { fundedBy: DiscountFundedBy }) {
  if (fundedBy === 'VENDOR') {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        Vendor
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Feastpot
    </span>
  );
}

function FundingOption({
  selected,
  onSelect,
  title,
  description,
  tone,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  tone: 'safe' | 'warn';
}) {
  const borderColor = selected
    ? tone === 'warn'
      ? 'border-amber-500 bg-amber-50'
      : 'border-emerald-600 bg-emerald-50'
    : 'border-border hover:bg-muted/40';

  const titleColor = selected
    ? tone === 'warn'
      ? 'text-amber-800'
      : 'text-emerald-800'
    : '';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border-2 px-4 py-3 text-left transition-colors ${borderColor}`}
    >
      <div className={`text-sm font-semibold ${titleColor}`}>{title}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

function ChangeFundingDialog({
  row,
  onClose,
  onConfirm,
  isPending,
}: {
  row: DiscountCodeRow;
  onClose: () => void;
  onConfirm: (id: string, fundedBy: DiscountFundedBy) => void;
  isPending: boolean;
}) {
  const [next, setNext] = useState<DiscountFundedBy>(row.fundedBy);
  const changed = next !== row.fundedBy;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change funding source</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Code <strong className="font-mono">{row.code}</strong> has not been redeemed yet, so
            the funding source can be changed.
          </p>
          <div className="space-y-2">
            <FundingOption
              selected={next === 'PLATFORM'}
              onSelect={() => setNext('PLATFORM')}
              title="Feastpot funds this"
              description="The vendor is paid in full. The discount comes out of Feastpot's commission."
              tone="safe"
            />
            <FundingOption
              selected={next === 'VENDOR'}
              onSelect={() => setNext('VENDOR')}
              title="The vendor funds this"
              description="The discount comes off the vendor's payout. Commission is calculated on the discounted amount."
              tone="warn"
            />
          </div>
          {next === 'VENDOR' && !row.vendorId ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              This code has no vendor attached. The server will reject a VENDOR funding source
              without a vendorId. Deactivate this code and create a vendor-scoped replacement
              instead.
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => onConfirm(row.id, next)}
              disabled={!changed || isPending || (next === 'VENDOR' && !row.vendorId)}
              className={next === 'VENDOR' ? 'bg-amber-600 hover:bg-amber-700' : ''}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function stripTrailingZeros(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, '');
}

function formatExpiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatExpiryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
