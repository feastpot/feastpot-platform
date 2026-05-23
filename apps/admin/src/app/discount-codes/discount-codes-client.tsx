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
  CalendarClock,
  MoreHorizontal,
  Percent,
  Plus,
  Store,
  Tag,
} from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import {
  useCreateDiscountCode,
  useDiscountCodes,
  useToggleDiscountCode,
  type CreateDiscountCodeInput,
  type DiscountCodeRow,
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
};

/**
 * Admin discount-code console. Finance can view + see redemption stats;
 * only `admin` can mint new codes or toggle active status - the server
 * also enforces this, the prop is just used to hide the buttons.
 */
export function DiscountCodesClient({ canCreate }: Props) {
  const { toast } = useToast();
  const { data, isLoading, error } = useDiscountCodes(1);
  const create = useCreateDiscountCode();
  const toggle = useToggleDiscountCode();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateDiscountCodeInput>(EMPTY_FORM);

  function update<K extends keyof CreateDiscountCodeInput>(key: K, value: CreateDiscountCodeInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    try {
      const payload: CreateDiscountCodeInput = {
        ...form,
        code: form.code.trim().toUpperCase(),
        minOrderPence: form.minOrderPence || 0,
        maxUses: form.maxUses && form.maxUses > 0 ? form.maxUses : undefined,
        expiresAt: form.expiresAt || undefined,
      };
      await create.mutateAsync(payload);
      toast({ title: 'Discount code created', description: payload.code });
      setForm(EMPTY_FORM);
      setOpen(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to create discount code';
      toast({ title: 'Could not create code', description: msg, variant: 'destructive' });
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

  const rows = data?.data ?? [];
  const colSpan = canCreate ? 9 : 8;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discount codes"
        description="Promotional codes redeemed at customer checkout."
        actions={
          canCreate ? (
            <Button onClick={() => setOpen(true)} className="bg-emerald-700 hover:bg-emerald-800">
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
                <TableHead className="uppercase tracking-wide text-xs">Status</TableHead>
                {canCreate ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">
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
                            onClick={() => setOpen(true)}
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
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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
              <Select value={form.type} onValueChange={(v) => update('type', v as DiscountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat (pence off)</SelectItem>
                  <SelectItem value="percentage">Percentage (basis points)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Value"
              hint={
                form.type === 'flat'
                  ? 'Pence - e.g. 500 = £5 off'
                  : 'Basis points - e.g. 1000 = 10% off, 500 = 5%'
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

            <Field label="Max uses (optional, blank = unlimited)">
              <Input
                type="number"
                min={1}
                value={form.maxUses || ''}
                onChange={(e) => update('maxUses', e.target.value ? Number(e.target.value) : undefined)}
              />
            </Field>

            <Field label="Expires at (optional)">
              <Input
                type="datetime-local"
                value={form.expiresAt ?? ''}
                onChange={(e) =>
                  update('expiresAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)
                }
              />
            </Field>

            <Field label="Vendor ID (optional, blank = all vendors)">
              <Input
                value={form.vendorId ?? ''}
                onChange={(e) => update('vendorId', e.target.value || undefined)}
                placeholder="UUID"
              />
            </Field>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={create.isPending || !form.code.trim() || !form.value}>
                {create.isPending ? 'Creating…' : 'Create code'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiscountRow({
  row: r,
  canCreate,
  toggling,
  onToggle,
}: {
  row: DiscountCodeRow;
  canCreate: boolean;
  toggling: boolean;
  onToggle: (id: string, isActive: boolean) => void;
}) {
  // Friendlier value formatting than the raw DB units (pence / basis
  // points). The wireframe shows "15% off" rather than the engineering
  // representation, so we humanise it here at the leaf.
  const valueLabel =
    r.type === 'flat'
      ? `${formatPence(r.value)} off`
      : `${stripTrailingZeros(r.value / 100)}% off`;

  const usedPct =
    r.maxUses && r.maxUses > 0 ? Math.min(100, Math.round((r.usedCount / r.maxUses) * 100)) : null;

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
            r.type === 'percentage'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-sky-100 text-sky-800'
          }`}
        >
          {r.type === 'percentage' ? <Percent className="h-3 w-3" /> : null}
          {r.type === 'percentage' ? 'Percentage' : 'Flat'}
        </span>
      </TableCell>

      <TableCell className="text-sm font-medium">{valueLabel}</TableCell>

      <TableCell className="text-sm">
        {r.minOrderPence ? formatPence(r.minOrderPence) : '—'}
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
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${usedPct}%` }}
            />
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
        <div className="flex items-start gap-1.5">
          <Store className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <div className="leading-tight">
            <div className="text-sm">{r.vendor?.businessName ?? 'FeastPot'}</div>
            <div className="text-xs text-muted-foreground">
              {r.vendor ? 'Vendor' : 'Platform'}
            </div>
          </div>
        </div>
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
              <Button
                size="icon"
                variant="ghost"
                aria-label="Row actions"
                disabled={toggling}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onToggle(r.id, !r.isActive)}>
                {r.isActive ? 'Disable code' : 'Enable code'}
              </DropdownMenuItem>
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function stripTrailingZeros(n: number): string {
  // 15 → "15", 12.5 → "12.5". Avoids "15.0% off" looking clunky.
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
