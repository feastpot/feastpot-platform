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
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { useToast } from '@/components/ui/toaster';
import {
  useCreateDiscountCode,
  useDiscountCodes,
  useToggleDiscountCode,
  type CreateDiscountCodeInput,
  type DiscountType,
} from '@/hooks/use-discount-codes';
import { ApiError } from '@/lib/api/client';
import { formatDate, formatPence } from '@/lib/format';

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
 * only `admin` can mint new codes or toggle active status — the server
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discount codes"
        description="Promotional codes redeemed at customer checkout."
        actions={
          canCreate ? <Button onClick={() => setOpen(true)}>New code</Button> : undefined
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
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Min order</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                {canCreate ? <TableHead className="w-32" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canCreate ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canCreate ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">
                    No discount codes yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.code}</TableCell>
                    <TableCell>{r.type}</TableCell>
                    <TableCell>
                      {r.type === 'flat' ? formatPence(r.value) : `${(r.value / 100).toFixed(2)}%`}
                    </TableCell>
                    <TableCell>{r.minOrderPence ? formatPence(r.minOrderPence) : '—'}</TableCell>
                    <TableCell>
                      {r.usedCount}
                      {r.maxUses ? ` / ${r.maxUses}` : ''}
                    </TableCell>
                    <TableCell>{r.expiresAt ? formatDate(r.expiresAt) : '—'}</TableCell>
                    <TableCell>{r.vendor?.businessName ?? 'All vendors'}</TableCell>
                    <TableCell>
                      <Badge variant={r.isActive ? 'default' : 'secondary'}>
                        {r.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    {canCreate ? (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggle.isPending}
                          onClick={() => onToggle(r.id, !r.isActive)}
                        >
                          {r.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
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
                  ? 'Pence — e.g. 500 = £5 off'
                  : 'Basis points — e.g. 1000 = 10% off, 500 = 5%'
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
