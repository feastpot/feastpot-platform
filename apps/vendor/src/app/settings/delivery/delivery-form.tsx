'use client';

import { Button, Card, CardContent } from '@feastpot/ui';
import { useEffect, useMemo, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import {
  useDeliveryConfig,
  useUpsertDeliveryConfig,
  type DeliveryType,
} from '@/hooks/use-delivery-config';
import { pencePerPound, poundsFromPence } from '@/lib/format';

interface FormState {
  types: Record<DeliveryType, boolean>;
  localRadiusMiles: number;
  localFee: string;
  collectionAddress: string;
  nationwideEnabled: boolean;
  nationwideFee: string;
  minOrder: string;
  freeDeliveryOver: string;
  postcodes: string;
}

const EMPTY: FormState = {
  types: { local: true, collection: false, nationwide: false },
  localRadiusMiles: 5,
  localFee: '',
  collectionAddress: '',
  nationwideEnabled: false,
  nationwideFee: '',
  minOrder: '',
  freeDeliveryOver: '',
  postcodes: '',
};

export function DeliveryForm() {
  const { data, isLoading } = useDeliveryConfig();
  const upsert = useUpsertDeliveryConfig();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    // The endpoint returns null when no config exists yet - show defaults.
    if (data && !seeded) {
      setForm({
        types: {
          local: data.types.includes('local'),
          collection: data.types.includes('collection'),
          nationwide: data.types.includes('nationwide'),
        },
        localRadiusMiles: data.localRadiusMiles,
        localFee: poundsFromPence(data.localFeePence).toFixed(2),
        collectionAddress: data.collectionAddress ?? '',
        nationwideEnabled: data.nationwideEnabled,
        nationwideFee: poundsFromPence(data.nationwideFeePence).toFixed(2),
        minOrder: poundsFromPence(data.minOrderPence).toFixed(2),
        freeDeliveryOver:
          data.freeDeliveryOverPence !== null
            ? poundsFromPence(data.freeDeliveryOverPence).toFixed(2)
            : '',
        postcodes: data.postcodes.join(', '),
      });
      setSeeded(true);
    }
    if (!isLoading && data === null && !seeded) setSeeded(true);
  }, [data, isLoading, seeded]);

  const selectedTypes = useMemo(
    () => (Object.keys(form.types) as DeliveryType[]).filter((k) => form.types[k]),
    [form.types],
  );
  const canSave = selectedTypes.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) {
      toast({ title: 'Pick at least one delivery type', variant: 'destructive' });
      return;
    }
    try {
      await upsert.mutateAsync({
        types: selectedTypes,
        localRadiusMiles: form.localRadiusMiles,
        localFeePence: pencePerPound(Number(form.localFee || 0)),
        collectionAddress: form.collectionAddress.trim() || undefined,
        nationwideEnabled: form.nationwideEnabled,
        nationwideFeePence: pencePerPound(Number(form.nationwideFee || 0)),
        minOrderPence: pencePerPound(Number(form.minOrder || 0)),
        freeDeliveryOverPence: form.freeDeliveryOver
          ? pencePerPound(Number(form.freeDeliveryOver))
          : null,
        postcodes: form.postcodes
          .split(/[,\n\s]+/)
          .map((p) => p.trim().toUpperCase())
          .filter(Boolean),
      });
      toast({ title: 'Delivery settings saved' });
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  if (isLoading && !seeded) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Delivery settings</h1>
        <p className="text-sm text-muted-foreground">
          Where you deliver, what you charge, and minimums.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <Label>Delivery types</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {(['local', 'collection', 'nationwide'] as DeliveryType[]).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-3 hover:bg-muted">
                <Checkbox
                  checked={form.types[t]}
                  onCheckedChange={(c) => setForm((s) => ({ ...s, types: { ...s.types, [t]: c === true } }))}
                />
                <span className="text-sm capitalize">{t}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {form.types.local && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <h2 className="font-medium">Local delivery</h2>
            <div>
              <Label>Radius: {form.localRadiusMiles} miles</Label>
              <Slider
                value={[form.localRadiusMiles]}
                min={1}
                max={15}
                step={1}
                onValueChange={(v) => setForm((s) => ({ ...s, localRadiusMiles: v[0] ?? 5 }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PoundsInput
                label="Base delivery fee"
                value={form.localFee}
                onChange={(v) => setForm((s) => ({ ...s, localFee: v }))}
              />
            </div>
            <div>
              <Label>Servicing postcodes (comma-separated prefixes, e.g. SW1, M14)</Label>
              <Textarea
                value={form.postcodes}
                onChange={(e) => setForm((s) => ({ ...s, postcodes: e.target.value }))}
                placeholder="SW1, SW3, SW10, M14…"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Map preview is on the roadmap - postcode list is what the customer search uses today.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {form.types.collection && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-medium">Collection</h2>
            <Label>Collection address</Label>
            <Textarea
              value={form.collectionAddress}
              onChange={(e) => setForm((s) => ({ ...s, collectionAddress: e.target.value }))}
              placeholder="Where customers come to collect"
            />
          </CardContent>
        </Card>
      )}

      {form.types.nationwide && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-medium">Nationwide shipping</h2>
            <div className="flex items-center justify-between">
              <Label>Currently shipping nationally</Label>
              <Switch
                checked={form.nationwideEnabled}
                onCheckedChange={(c) => setForm((s) => ({ ...s, nationwideEnabled: c }))}
              />
            </div>
            <PoundsInput
              label="Nationwide flat fee"
              value={form.nationwideFee}
              onChange={(v) => setForm((s) => ({ ...s, nationwideFee: v }))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-medium">Order rules</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <PoundsInput
              label="Minimum order"
              value={form.minOrder}
              onChange={(v) => setForm((s) => ({ ...s, minOrder: v }))}
            />
            <PoundsInput
              label="Free delivery over (optional)"
              value={form.freeDeliveryOver}
              onChange={(v) => setForm((s) => ({ ...s, freeDeliveryOver: v }))}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Lead time, available days and slot windows aren&apos;t configurable yet - they ship with the
            scheduled-orders update.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={upsert.isPending || !canSave}>
          {upsert.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}

function PoundsInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
        <span className="pl-3 text-sm text-muted-foreground">£</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-md bg-transparent px-2 text-sm focus:outline-none"
        />
      </div>
    </div>
  );
}
