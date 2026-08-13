'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react';
import { Button, Card, CardContent } from '@feastpot/ui';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/toaster';
import {
  useDeliveryConfig,
  useUpsertDeliveryConfig,
  type DeliveryType,
} from '@/hooks/use-delivery-config';
import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { pencePerPound, poundsFromPence } from '@/lib/format';

// ---- types ----

interface KitchenCoords {
  lat: number | null;
  lng: number | null;
  area: string | null;
}

interface FormState {
  kitchenPostcode: string;
  localRadiusMiles: number;
  postcodes: string[]; // the chip set - what customer search uses
  addDistrict: string;
  types: { local: boolean; collection: boolean };
  localFee: string;
  collectionLine1: string;
  collectionLine2: string;
  collectionTown: string;
  collectionPostcode: string;
  minOrder: string;
  freeDeliveryOver: string;
}

const EMPTY: FormState = {
  kitchenPostcode: '',
  localRadiusMiles: 5,
  postcodes: [],
  addDistrict: '',
  types: { local: true, collection: false },
  localFee: '',
  collectionLine1: '',
  collectionLine2: '',
  collectionTown: '',
  collectionPostcode: '',
  minOrder: '',
  freeDeliveryOver: '',
};

// ---- helpers ----

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i;
const UK_OUTWARD_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/i;

async function fetchPostcodeInfo(
  postcode: string,
): Promise<{ latitude: number; longitude: number; admin_district: string | null } | null> {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { latitude: number; longitude: number; admin_district: string | null };
    };
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function outcodeExists(code: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.postcodes.io/outcodes/${encodeURIComponent(code.toUpperCase())}`,
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ---- component ----

export function DeliveryForm() {
  const { data, isLoading } = useDeliveryConfig();
  const upsert = useUpsertDeliveryConfig();
  const { toast } = useToast();
  const { token } = useAccessToken();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [seeded, setSeeded] = useState(false);

  const [kitchenCoords, setKitchenCoords] = useState<KitchenCoords>({
    lat: null,
    lng: null,
    area: null,
  });
  const [kitchenError, setKitchenError] = useState<string | null>(null);
  const [kitchenValidating, setKitchenValidating] = useState(false);

  const [computingDistricts, setComputingDistricts] = useState(false);
  const districtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addDistrictError, setAddDistrictError] = useState<string | null>(null);
  const [addDistrictValidating, setAddDistrictValidating] = useState(false);

  // ---- seed from API on first load ----

  // useEffect replaced with a ref-guarded pattern to avoid double-seed on
  // StrictMode double-invoke. Runs once when data arrives.
  const seedRef = useRef(false);
  if (data && !seedRef.current && !isLoading) {
    seedRef.current = true;
    const nextForm: FormState = {
      kitchenPostcode: data.kitchenPostcode ?? '',
      localRadiusMiles: data.localRadiusMiles,
      postcodes: data.postcodes,
      addDistrict: '',
      types: {
        local: data.types.includes('local'),
        collection: data.types.includes('collection'),
      },
      localFee: poundsFromPence(data.localFeePence).toFixed(2),
      collectionLine1: data.collectionLine1 ?? '',
      collectionLine2: data.collectionLine2 ?? '',
      collectionTown: data.collectionTown ?? '',
      collectionPostcode: data.collectionPostcode ?? '',
      minOrder: poundsFromPence(data.minOrderPence).toFixed(2),
      freeDeliveryOver:
        data.freeDeliveryOverPence !== null
          ? poundsFromPence(data.freeDeliveryOverPence).toFixed(2)
          : '',
    };
    // Batch the state update in a microtask so it happens after first render.
    Promise.resolve().then(() => {
      setForm(nextForm);
      setSeeded(true);
      if (data.latitude !== null && data.longitude !== null) {
        setKitchenCoords({ lat: data.latitude, lng: data.longitude, area: null });
      }
      if (data.kitchenPostcode) {
        void fetchPostcodeInfo(data.kitchenPostcode).then((r) => {
          if (r) setKitchenCoords({ lat: r.latitude, lng: r.longitude, area: r.admin_district });
        });
      }
    });
  }
  if (!data && !isLoading && !seedRef.current) {
    seedRef.current = true;
    Promise.resolve().then(() => setSeeded(true));
  }

  // ---- validate kitchen postcode on blur ----

  const validateKitchen = useCallback(async (raw: string) => {
    const clean = raw.trim();
    if (!clean) {
      setKitchenError(null);
      setKitchenCoords({ lat: null, lng: null, area: null });
      return;
    }
    if (!UK_POSTCODE_RE.test(clean)) {
      setKitchenError('Enter a full UK postcode (e.g. SW9 2JB)');
      return;
    }
    setKitchenValidating(true);
    setKitchenError(null);
    const result = await fetchPostcodeInfo(clean);
    setKitchenValidating(false);
    if (!result) {
      setKitchenError('Postcode not found - check and try again');
      setKitchenCoords({ lat: null, lng: null, area: null });
    } else {
      setKitchenCoords({ lat: result.latitude, lng: result.longitude, area: result.admin_district });
    }
  }, []);

  // ---- radius slider: compute districts on change ----

  function onRadiusChange(v: number[]) {
    const miles = v[0] ?? 5;
    setForm((s) => ({ ...s, localRadiusMiles: miles }));

    if (!kitchenCoords.lat || !kitchenCoords.lng || !token) return;

    if (districtTimer.current) clearTimeout(districtTimer.current);
    districtTimer.current = setTimeout(() => {
      void (async () => {
        setComputingDistricts(true);
        try {
          const result = await apiRequest<{ districts: string[] }>(
            `/vendors/me/delivery-config/compute-districts?lat=${kitchenCoords.lat}&lng=${kitchenCoords.lng}&radiusMiles=${miles}`,
            { accessToken: token },
          );
          setForm((s) => ({ ...s, postcodes: result.districts }));
        } catch {
          // Silently leave the existing chips on network error.
        } finally {
          setComputingDistricts(false);
        }
      })();
    }, 600);
  }

  // ---- add district manually ----

  async function addDistrict() {
    const code = form.addDistrict.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return;
    if (!UK_OUTWARD_RE.test(code)) {
      setAddDistrictError('Enter a valid postcode district (e.g. SW9, M14, SE15)');
      return;
    }
    if (form.postcodes.includes(code)) {
      setForm((s) => ({ ...s, addDistrict: '' }));
      setAddDistrictError(null);
      return;
    }
    setAddDistrictValidating(true);
    setAddDistrictError(null);
    const valid = await outcodeExists(code);
    setAddDistrictValidating(false);
    if (!valid) {
      setAddDistrictError(`${code} is not a recognised UK postcode district`);
      return;
    }
    setForm((s) => ({
      ...s,
      postcodes: [...s.postcodes, code].sort(),
      addDistrict: '',
    }));
  }

  // ---- computed validation ----

  const minOrderPence = pencePerPound(Number(form.minOrder || 0));
  const freeDeliveryPence = form.freeDeliveryOver
    ? pencePerPound(Number(form.freeDeliveryOver))
    : null;
  const freeDeliveryError =
    freeDeliveryPence !== null && freeDeliveryPence <= minOrderPence
      ? `Free delivery threshold (£${(freeDeliveryPence / 100).toFixed(2)}) must be higher than the minimum order (£${(minOrderPence / 100).toFixed(2)}).`
      : null;

  const selectedTypes = (
    Object.entries(form.types) as [keyof typeof form.types, boolean][]
  )
    .filter(([, v]) => v)
    .map(([k]) => k as DeliveryType);

  const canSave =
    selectedTypes.length > 0 && !kitchenError && !freeDeliveryError && !kitchenValidating;

  // ---- plain-English order-rules summary ----

  const localFeeNum = Number(form.localFee || 0);
  const minOrderNum = Number(form.minOrder || 0);
  const freeDeliveryNum = form.freeDeliveryOver ? Number(form.freeDeliveryOver) : null;

  let orderSummary: string | null = null;
  if (!freeDeliveryError) {
    if (freeDeliveryNum !== null) {
      orderSummary = `Orders over £${freeDeliveryNum.toFixed(2)} get free delivery. Below that, delivery is £${localFeeNum.toFixed(2)}.`;
    } else if (localFeeNum > 0) {
      orderSummary =
        minOrderNum > 0
          ? `Delivery is £${localFeeNum.toFixed(2)} on orders of £${minOrderNum.toFixed(2)} or more.`
          : `Delivery is £${localFeeNum.toFixed(2)}.`;
    } else if (minOrderNum > 0) {
      orderSummary = `Minimum order is £${minOrderNum.toFixed(2)}.`;
    }
  }

  // ---- submit ----

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) {
      toast({ title: 'Fix the errors above before saving', variant: 'destructive' });
      return;
    }
    try {
      await upsert.mutateAsync({
        types: selectedTypes,
        localRadiusMiles: form.localRadiusMiles,
        localFeePence: pencePerPound(Number(form.localFee || 0)),
        postcodes: form.postcodes,
        kitchenPostcode: form.kitchenPostcode.trim() || undefined,
        collectionLine1: form.collectionLine1.trim() || undefined,
        collectionLine2: form.collectionLine2.trim() || undefined,
        collectionTown: form.collectionTown.trim() || undefined,
        collectionPostcode: form.collectionPostcode.trim() || undefined,
        minOrderPence,
        freeDeliveryOverPence: freeDeliveryPence,
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

  // ---- render ----

  if (isLoading && !seeded) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Delivery settings</h1>
        <p className="text-sm text-muted-foreground">
          Where you deliver, what you charge, and minimums.
        </p>
      </div>

      {/* Kitchen location */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h2 className="font-medium">Kitchen location</h2>
            <p className="text-xs text-muted-foreground">
              Your kitchen postcode anchors your service area. Enter a full UK postcode (e.g. SW9
              2JB). The radius slider below uses this location to compute your delivery districts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                aria-label="Kitchen postcode"
                placeholder="SW9 2JB"
                value={form.kitchenPostcode}
                onChange={(e) =>
                  setForm((s) => ({ ...s, kitchenPostcode: e.target.value.toUpperCase() }))
                }
                onBlur={() => void validateKitchen(form.kitchenPostcode)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {kitchenValidating && (
                <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          {kitchenError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {kitchenError}
            </p>
          )}
          {kitchenCoords.area && !kitchenError && (
            <p className="text-xs text-muted-foreground">{kitchenCoords.area}</p>
          )}
        </CardContent>
      </Card>

      {/* Delivery types */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <Label>Delivery types</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { key: 'local', label: 'Local delivery' },
                { key: 'collection', label: 'Collection' },
              ] as { key: keyof typeof form.types; label: string }[]
            ).map(({ key, label }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-3 hover:bg-muted"
              >
                <Checkbox
                  checked={form.types[key]}
                  onCheckedChange={(c) =>
                    setForm((s) => ({ ...s, types: { ...s.types, [key]: c === true } }))
                  }
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          {selectedTypes.length === 0 && (
            <p className="text-xs text-destructive">Select at least one delivery type.</p>
          )}
        </CardContent>
      </Card>

      {/* Service area - only shown when local delivery is on */}
      {form.types.local && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="font-medium">Service area</h2>
              <p className="text-xs text-muted-foreground">
                Adjust the radius to compute which postcode districts to cover, then remove any you
                do not serve or add extras. The list below is what customer search uses to find you.
              </p>
            </div>

            {/* Radius slider */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>
                  Radius: {form.localRadiusMiles}{' '}
                  {form.localRadiusMiles === 1 ? 'mile' : 'miles'}
                </Label>
                {computingDistricts && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    Computing districts...
                  </span>
                )}
              </div>
              {!kitchenCoords.lat && (
                <p className="mb-2 text-xs text-amber-600">
                  Set a kitchen postcode above to enable radius computation.
                </p>
              )}
              <Slider
                value={[form.localRadiusMiles]}
                min={1}
                max={15}
                step={1}
                disabled={!kitchenCoords.lat || computingDistricts}
                onValueChange={onRadiusChange}
              />
            </div>

            {/* Chips */}
            <div>
              <div className="flex min-h-8 flex-wrap gap-1.5">
                {form.postcodes.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark"
                  >
                    {code}
                    <button
                      type="button"
                      aria-label={`Remove ${code}`}
                      onClick={() =>
                        setForm((s) => ({
                          ...s,
                          postcodes: s.postcodes.filter((p) => p !== code),
                        }))
                      }
                      className="ml-0.5 rounded-full p-0.5 hover:bg-teal/20"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </span>
                ))}
                {form.postcodes.length === 0 && !computingDistricts && (
                  <span className="self-center text-xs text-muted-foreground">
                    No districts selected.
                  </span>
                )}
              </div>

              {form.postcodes.length === 0 && !computingDistricts && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Without any districts you will not appear in customer search.
                </p>
              )}
            </div>

            {/* Add district manually */}
            <div>
              <Label className="mb-1.5 block text-sm">Add a district</Label>
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Postcode district to add"
                  placeholder="e.g. SW9"
                  value={form.addDistrict}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      addDistrict: e.target.value.toUpperCase().replace(/\s+/g, ''),
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addDistrict();
                    }
                  }}
                  className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.addDistrict.trim() || addDistrictValidating}
                  onClick={() => void addDistrict()}
                  className="gap-1"
                >
                  {addDistrictValidating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden />
                  )}
                  Add
                </Button>
              </div>
              {addDistrictError && (
                <p className="mt-1 text-xs text-destructive">{addDistrictError}</p>
              )}
            </div>

            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground/70">
              These postcode districts are what customer search uses to find you.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Local delivery fee */}
      {form.types.local && (
        <Card>
          <CardContent className="p-4">
            <PoundsInput
              label="Delivery fee"
              value={form.localFee}
              onChange={(v) => setForm((s) => ({ ...s, localFee: v }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Collection address - structured */}
      {form.types.collection && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-medium">Collection address</h2>
            <TextInput
              label="Address line 1"
              value={form.collectionLine1}
              onChange={(v) => setForm((s) => ({ ...s, collectionLine1: v }))}
              placeholder="15 Coldharbour Lane"
            />
            <TextInput
              label="Address line 2 (optional)"
              value={form.collectionLine2}
              onChange={(v) => setForm((s) => ({ ...s, collectionLine2: v }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="Town or city"
                value={form.collectionTown}
                onChange={(v) => setForm((s) => ({ ...s, collectionTown: v }))}
                placeholder="London"
              />
              <TextInput
                label="Postcode"
                value={form.collectionPostcode}
                onChange={(v) => setForm((s) => ({ ...s, collectionPostcode: v.toUpperCase() }))}
                placeholder="SE5 9NR"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order rules */}
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
          {freeDeliveryError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {freeDeliveryError}
            </p>
          )}
          {orderSummary && (
            <p className="text-xs text-muted-foreground">{orderSummary}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Opening days, slot windows, prep lead time and daily caps live on the{' '}
            <a
              className="font-semibold text-teal underline-offset-2 hover:underline"
              href="/availability"
            >
              Availability
            </a>{' '}
            page.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={upsert.isPending || !canSave}>
          {upsert.isPending ? 'Saving...' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}

// ---- sub-components ----

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

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
