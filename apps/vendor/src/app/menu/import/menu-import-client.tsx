'use client';

import { Badge, Button, Card, CardContent, Input } from '@feastpot/ui';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import { useMenus } from '@/hooks/use-menus';
import {
  ALLERGENS,
  useAddMenuImportItem,
  useApplyMenuImport,
  useBulkConfirmMenuImportAllergens,
  useConfirmMenuImportAllergens,
  useCopyMenuImportAllergens,
  useCreateMenuImport,
  useEditMenuImportItem,
  useMenuImport,
  useMenuImports,
  useRejectMenuImportItem,
  type ImportItem,
  type MenuImport,
} from '@/hooks/use-menu-imports';

const inputClass =
  'h-11 rounded-lg border border-border bg-white px-3 text-sm text-dark focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25';
type ToastFn = (input: { title: string; description?: string; variant?: 'destructive' }) => void;
type ImportMutation = { mutate: Function; isPending: boolean };
type SelectionSetter = (value: string[] | ((current: string[]) => string[])) => void;
const flagLabel = (flag: string) =>
  flag
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function MenuImportClient({ vendorId }: { vendorId: string }) {
  const imports = useMenuImports(vendorId);
  const [importId, setImportId] = useState<string | undefined>();
  const currentId = importId;
  const detail = useMenuImport(vendorId, currentId);
  const create = useCreateMenuImport(vendorId);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);

  const selectFiles = (list: FileList | null) => {
    const chosen = Array.from(list ?? []);
    if (chosen.length > 4) return toast({ title: 'Choose up to 4 files', variant: 'destructive' });
    const invalid = chosen.find(
      (f) => !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type),
    );
    if (invalid)
      return toast({ title: 'Use PDF, JPG, PNG, or WebP files', variant: 'destructive' });
    const oversized = chosen.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized)
      return toast({ title: `${oversized.name} is larger than 10 MB`, variant: 'destructive' });
    setFiles(chosen);
  };
  const upload = () => {
    create.mutate(files, {
      onSuccess: (result) => {
        setImportId(result.id);
        setFiles([]);
        toast({ title: 'Import started', description: 'We are reading your menu now.' });
      },
      onError: (error) =>
        toast({
          title: 'Could not read those files',
          description: error.message,
          variant: 'destructive',
        }),
    });
  };

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/menu"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to menus
      </Link>
      <header className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Menu import</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-dark">
          Bring your menu as it is
        </h1>
        <p className="mt-2 text-sm leading-6 text-mid">
          Upload the menu you already share on WhatsApp, Instagram, paper, or PDF. We will turn it
          into an editable draft.
        </p>
      </header>
      {!currentId && (
        <Card className="border-teal/30 bg-white shadow-sm">
          <CardContent className="p-5 sm:p-8">
            <div className="rounded-2xl border-2 border-dashed border-teal/35 bg-teal-light/20 p-6 text-center sm:p-10">
              <FileUp className="mx-auto h-10 w-10 text-teal" aria-hidden />
              <h2 className="mt-4 text-xl font-bold text-dark">Upload 1–4 menu files</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-mid">
                Images and PDFs are welcome. Camera capture works on mobile. We never publish
                imported dishes automatically.
              </p>
              <input
                ref={galleryInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => selectFiles(e.target.files)}
                aria-label="Choose menu files from device"
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                onChange={(e) => selectFiles(e.target.files)}
                aria-label="Take a photo of your menu"
              />
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  onClick={() => galleryInput.current?.click()}
                  className="min-h-12 gap-2 bg-teal hover:bg-teal-dark"
                >
                  <FileUp className="h-4 w-4" /> Choose files
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraInput.current?.click()}
                  className="min-h-12 gap-2"
                >
                  <Upload className="h-4 w-4" /> Take a photo
                </Button>
              </div>
              {files.length > 0 && (
                <div className="mx-auto mt-4 max-w-md space-y-2 text-left">
                  {files.map((file) => (
                    <div
                      key={file.name}
                      className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm"
                    >
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        className="touch-target grid place-items-center text-mid hover:text-dark"
                        onClick={() => setFiles(files.filter((f) => f !== file))}
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {files.length > 0 && (
                <Button
                  type="button"
                  onClick={upload}
                  disabled={create.isPending}
                  className="mt-4 min-h-12 gap-2"
                >
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Start menu
                  import
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {imports.data && imports.data.length > 0 && !currentId && (
        <ImportHistory imports={imports.data} onSelect={setImportId} />
      )}
      {currentId && detail.isLoading && <LoadingCard />}
      {currentId && detail.error && (
        <ErrorCard
          message={
            detail.error instanceof Error ? detail.error.message : 'Try loading this import again.'
          }
          onRetry={() => detail.refetch()}
        />
      )}
      {detail.data && (
        <ReviewImport
          vendorId={vendorId}
          importData={detail.data}
          onBack={() => setImportId(undefined)}
        />
      )}
    </main>
  );
}

function ImportHistory({
  imports,
  onSelect,
}: {
  imports: { id: string; status: string; createdAt: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-mid">Previous imports</h2>
      {imports.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => onSelect(item.id)}
          className="flex min-h-14 w-full items-center justify-between rounded-xl border border-border bg-white px-4 text-left hover:border-teal"
        >
          <span className="font-semibold text-dark">
            {new Date(item.createdAt).toLocaleDateString('en-GB')}
          </span>
          <Badge variant="secondary">{item.status}</Badge>
        </button>
      ))}
    </section>
  );
}
function LoadingCard() {
  return (
    <Card>
      <CardContent className="space-y-3 p-8">
        <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
        <div className="h-20 animate-pulse rounded bg-muted" />
        <div className="h-20 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-red-200">
      <CardContent className="flex items-center gap-3 p-5 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-700" />
        <span className="flex-1">{message}</span>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewImport({
  vendorId,
  importData,
  onBack,
}: {
  vendorId: string;
  importData: MenuImport;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [dirtyItemIds, setDirtyItemIds] = useState<Set<string>>(() => new Set());
  const [menuId, setMenuId] = useState('');
  const menus = useMenus(vendorId);
  const edit = useEditMenuImportItem(vendorId, importData.id);
  const add = useAddMenuImportItem(vendorId, importData.id);
  const reject = useRejectMenuImportItem(vendorId, importData.id);
  const allergens = useConfirmMenuImportAllergens(vendorId, importData.id);
  const bulk = useBulkConfirmMenuImportAllergens(vendorId, importData.id);
  const copy = useCopyMenuImportAllergens(vendorId, importData.id);
  const apply = useApplyMenuImport(vendorId, importData.id);
  const activeItems = importData.items.filter(
    (item) => !['rejected', 'applied'].includes(item.status),
  );
  const eligibleItems = activeItems.filter((item) => !dirtyItemIds.has(item.id));
  const eligibleIds = new Set(eligibleItems.map((item) => item.id));
  const safeSelected = selected.filter((itemId) => eligibleIds.has(itemId));
  const confirmed = activeItems.filter((i) => !!i.allergenConfirmedAt).length;
  const failed = ['failed', 'error'].includes(importData.status);
  const allSelected = safeSelected.length > 0 && safeSelected.length === eligibleItems.length;
  const markDirty = (itemId: string, dirty: boolean) => {
    setDirtyItemIds((current) => {
      const next = new Set(current);
      if (dirty) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };
  const confirm = (
    itemId: string,
    values: { allergens: string[]; allergensFreeFrom: boolean },
    onSuccess?: (item: ImportItem) => void,
    onFailure?: () => void,
  ) =>
    allergens.mutate(
      { ...values, itemId },
      {
        onSuccess: (saved: ImportItem) => onSuccess?.(saved),
        onError: (e) => (
          onFailure?.(),
          toast({
            title: 'Could not save allergens',
            description: e.message,
            variant: 'destructive',
          })
        ),
      },
    );
  const applyImport = () => {
    if (!menuId) return toast({ title: 'Choose a menu first', variant: 'destructive' });
    apply.mutate(
      { menuId },
      {
        onSuccess: () => {
          toast({ title: 'Draft dishes added to your menu' });
          router.push(`/menu/${menuId}`);
        },
        onError: (e) =>
          toast({ title: 'Could not add dishes', description: e.message, variant: 'destructive' }),
      },
    );
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal"
          >
            <ArrowLeft className="h-4 w-4" /> All imports
          </button>
          <h2 className="text-2xl font-extrabold text-dark">
            {failed ? 'We could not read everything' : 'Review your imported menu'}
          </h2>
        </div>
        <Badge variant={failed ? 'destructive' : 'secondary'}>{importData.status}</Badge>
      </div>
      {failed && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-950">
            <strong>Some dishes may be missing.</strong>{' '}
            {importData.errorMessage ??
              importData.error ??
              importData.message ??
              'The menu could not be fully read.'}{' '}
            You can still add each missed dish manually below.
          </CardContent>
        </Card>
      )}
      <Card className="border-teal/25 bg-teal-light/20">
        <CardContent className="p-5">
          <p className="text-base font-bold leading-6 text-dark">
            We have built your menu. Now tell us what is in each dish so customers with allergies
            can order safely.
          </p>
          <p className="mt-2 text-sm text-mid">
            Changes save continuously. A dish is only confirmed when you make an allergen
            declaration.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-teal transition-all"
                style={{
                  width: `${importData.items.length ? (confirmed / importData.items.length) * 100 : 0}%`,
                }}
              />
            </div>
            <strong
              className="whitespace-nowrap text-sm text-dark"
              data-testid="status-confirmed-progress"
            >
              {confirmed} of {importData.items.length} confirmed
            </strong>
          </div>
        </CardContent>
      </Card>
      <BulkBar
        items={eligibleItems}
        selected={safeSelected}
        setSelected={setSelected}
        dirtyItemIds={dirtyItemIds}
        allSelected={allSelected}
        bulk={bulk}
        toast={toast}
      />
      <div className="space-y-4">
        {activeItems.map((item) => (
          <ImportItemCard
            key={item.id}
            item={item}
            allItems={importData.items}
            selected={selected}
            setSelected={setSelected}
            isDirty={dirtyItemIds.has(item.id)}
            onDirtyChange={markDirty}
            edit={edit}
            reject={reject}
            copy={copy}
            allergens={allergens}
            confirm={confirm}
            toast={toast}
          />
        ))}
      </div>
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-dark">Did we miss a dish?</h3>
          <p className="mt-1 text-sm text-mid">Add it manually and declare its allergens below.</p>
          <ManualAdd add={add} toast={toast} />
        </CardContent>
      </Card>
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="space-y-3 p-5">
          <h3 className="font-bold text-amber-950">Create drafts only</h3>
          <p className="text-sm leading-6 text-amber-950">
            Imported items remain drafts and unavailable. Customers cannot see them until you
            review, confirm allergens, and make them available in the menu.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Menu to apply import to"
              className={`${inputClass} flex-1`}
              value={menuId}
              onChange={(e) => setMenuId(e.target.value)}
            >
              <option value="">Choose a menu</option>
              {(menus.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button
              onClick={applyImport}
              disabled={
                apply.isPending ||
                !menuId ||
                !activeItems.length ||
                confirmed !== activeItems.length ||
                dirtyItemIds.size > 0
              }
              className="min-h-11 gap-2 bg-teal hover:bg-teal-dark"
            >
              <Save className="h-4 w-4" /> Add drafts to menu
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BulkBar({
  items,
  selected,
  setSelected,
  allSelected,
  bulk,
  toast,
  dirtyItemIds,
}: {
  items: ImportItem[];
  selected: string[];
  setSelected: SelectionSetter;
  allSelected: boolean;
  bulk: ImportMutation;
  toast: ToastFn;
  dirtyItemIds: Set<string>;
}) {
  const [free, setFree] = useState(false);
  const [values, setValues] = useState<string[]>([]);
  if (!items.length) return null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) =>
              setSelected(e.target.checked ? items.map((i: ImportItem) => i.id) : [])
            }
          />{' '}
          Select all
        </label>
        {dirtyItemIds.size > 0 && (
          <p className="text-xs font-semibold text-amber-800">
            Finish editing {dirtyItemIds.size} dish{dirtyItemIds.size === 1 ? '' : 'es'} before bulk
            applying.
          </p>
        )}
        <select
          className={`${inputClass} flex-1`}
          multiple
          value={values}
          onChange={(e) => setValues(Array.from(e.target.selectedOptions, (o) => o.value))}
          aria-label="Bulk allergens"
        >
          {ALLERGENS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> Free
          from all 14
        </label>
        <Button
          disabled={!selected.length || bulk.isPending}
          onClick={() =>
            bulk.mutate(
              { itemIds: selected, allergens: free ? [] : values, allergensFreeFrom: free },
              { onSuccess: () => toast({ title: 'Allergen declarations saved' }) },
            )
          }
        >
          Apply to selected
        </Button>
      </CardContent>
    </Card>
  );
}

function ImportItemCard({
  item,
  allItems,
  selected,
  setSelected,
  isDirty,
  onDirtyChange,
  edit,
  reject,
  copy,
  allergens,
  confirm,
  toast,
}: {
  item: ImportItem;
  allItems: ImportItem[];
  selected: string[];
  setSelected: SelectionSetter;
  isDirty: boolean;
  onDirtyChange: (itemId: string, dirty: boolean) => void;
  edit: ImportMutation;
  reject: ImportMutation;
  copy: ImportMutation;
  allergens: ImportMutation;
  confirm: (
    itemId: string,
    values: { allergens: string[]; allergensFreeFrom: boolean },
    onSuccess?: (item: ImportItem) => void,
    onFailure?: () => void,
  ) => void;
  toast: ToastFn;
}) {
  const [values, setValues] = useState({
    name: item.name,
    description: item.description ?? '',
    price: item.pricePence == null ? '' : String(item.pricePence / 100),
    portion: item.portionLabel ?? '',
  });
  const [chosen, setChosen] = useState<string[]>(item.allergens ?? []);
  const [free, setFree] = useState(!!item.allergensFreeFrom);
  const [allergenDraftDirty, setAllergenDraftDirty] = useState(false);
  const textDirty = useRef(false);
  const setDirty = (dirty: boolean) => onDirtyChange(item.id, dirty);
  useEffect(() => {
    if (!allergenDraftDirty) {
      setChosen(item.allergens ?? []);
      setFree(!!item.allergensFreeFrom);
    }
    if (!textDirty.current) {
      setValues({
        name: item.name,
        description: item.description ?? '',
        price: item.pricePence == null ? '' : String(item.pricePence / 100),
        portion: item.portionLabel ?? '',
      });
    }
  }, [item, allergenDraftDirty]);
  const save = (patch: Record<string, unknown>) =>
    edit.mutate(
      { ...patch, itemId: item.id },
      {
        onSuccess: () => {
          textDirty.current = false;
          setDirty(false);
        },
        onError: (e: Error) =>
          toast({ title: 'Could not save change', description: e.message, variant: 'destructive' }),
      },
    );
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((v) => v !== id) : [...chosen, id];
    setChosen(next);
    setFree(false);
    setAllergenDraftDirty(true);
    setDirty(true);
  };
  const allergensPending = () => allergens.isPending;
  return (
    <Card className={item.allergenConfirmedAt ? 'border-teal/40' : 'border-amber-300'}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            aria-label={`Select ${item.name}`}
            className="mt-2 h-5 w-5"
            disabled={isDirty}
            title={isDirty ? 'Finish saving this dish before selecting it' : undefined}
            checked={selected.includes(item.id)}
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, item.id]
                  : selected.filter((id: string) => id !== item.id),
              )
            }
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-dark">{item.name}</h3>
              {item.reviewFlags?.length > 0 && (
                <Badge variant="secondary">{item.reviewFlags.join(', ')}</Badge>
              )}
              {item.allergenConfirmedAt && (
                <Badge className="gap-1 bg-teal-light text-teal-dark">
                  <Check className="h-3 w-3" /> Confirmed
                </Badge>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-mid">
                Name
                <input
                  className={`${inputClass} mt-1 w-full`}
                  value={values.name}
                  onChange={(e) => {
                    textDirty.current = true;
                    setDirty(true);
                    setValues({ ...values, name: e.target.value });
                  }}
                  onBlur={() => save({ name: values.name })}
                />
              </label>
              <label className="text-xs font-semibold text-mid">
                Price
                <input
                  className={`${inputClass} mt-1 w-full`}
                  inputMode="decimal"
                  value={values.price}
                  onChange={(e) => {
                    textDirty.current = true;
                    setDirty(true);
                    setValues({ ...values, price: e.target.value });
                  }}
                  onBlur={() => {
                    if (values.price.trim() !== '' && Number.isFinite(Number(values.price))) {
                      save({ pricePence: Math.round(Number(values.price) * 100) });
                      textDirty.current = false;
                    }
                  }}
                />
              </label>
              <label className="text-xs font-semibold text-mid sm:col-span-2">
                Description
                <textarea
                  className={`${inputClass} mt-1 h-20 w-full py-2`}
                  value={values.description}
                  onChange={(e) => {
                    textDirty.current = true;
                    setDirty(true);
                    setValues({ ...values, description: e.target.value });
                  }}
                  onBlur={() => save({ description: values.description })}
                />
              </label>
              <label className="text-xs font-semibold text-mid">
                Portion
                <input
                  className={`${inputClass} mt-1 w-full`}
                  value={values.portion}
                  onChange={(e) => {
                    textDirty.current = true;
                    setDirty(true);
                    setValues({ ...values, portion: e.target.value });
                  }}
                  onBlur={() => save({ portionLabel: values.portion })}
                />
              </label>
            </div>
          </div>
          <button
            type="button"
            className="touch-target grid place-items-center rounded-lg text-red-700 hover:bg-red-50"
            aria-label={`Remove ${item.name}`}
            onClick={() =>
              reject.mutate(
                { itemId: item.id },
                { onSuccess: () => toast({ title: 'Dish removed' }) },
              )
            }
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
        <fieldset>
          <legend className="text-sm font-bold text-dark">What is in this dish?</legend>
          <p className="mt-1 text-xs text-mid">Select every allergen present. Do not guess.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ALLERGENS.map(([id, label]) => (
              <label
                key={id}
                className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${chosen.includes(id) ? 'border-teal bg-teal-light/40 text-teal-dark' : 'border-border bg-white text-dark'}`}
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(id)}
                  disabled={free || allergens.isPending}
                  onChange={() => toggle(id)}
                />
                {label}
              </label>
            ))}
          </div>
          <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-950">
            <input
              type="checkbox"
              checked={free}
              disabled={allergens.isPending}
              onChange={(e) => {
                setFree(e.target.checked);
                setChosen([]);
                setAllergenDraftDirty(true);
                setDirty(true);
              }}
            />{' '}
            This dish is free from all 14 allergens
          </label>
          <Button
            type="button"
            className="mt-3 min-h-11"
            disabled={(!chosen.length && !free) || allergensPending()}
            onClick={() =>
              confirm(
                item.id,
                { allergens: free ? [] : chosen, allergensFreeFrom: free },
                (saved) => {
                  setChosen(saved.allergens ?? []);
                  setFree(!!saved.allergensFreeFrom);
                  setAllergenDraftDirty(false);
                  setDirty(false);
                },
                () => {
                  setChosen(item.allergens ?? []);
                  setFree(!!item.allergensFreeFrom);
                  setAllergenDraftDirty(false);
                  setDirty(false);
                },
              )
            }
          >
            Confirm selected allergens
          </Button>
        </fieldset>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <select
            className={`${inputClass} max-w-xs`}
            disabled={copy.isPending || allergens.isPending}
            aria-label={`Copy allergens to ${item.name}`}
            onChange={(e) => {
              if (!e.target.value) return;
              copy.mutate(
                { itemId: item.id, sourceItemId: e.target.value },
                {
                  onSuccess: (saved: ImportItem) => {
                    setChosen(saved.allergens ?? []);
                    setFree(!!saved.allergensFreeFrom);
                    setAllergenDraftDirty(false);
                    toast({ title: 'Allergens copied and saved' });
                  },
                  onError: (error: Error) =>
                    toast({
                      title: 'Could not copy allergens',
                      description: error.message,
                      variant: 'destructive',
                    }),
                },
              );
            }}
          >
            <option value="">Copy from a confirmed dish…</option>
            {allItems
              .filter((other: ImportItem) => other.id !== item.id && other.allergenConfirmedAt)
              .map((other: ImportItem) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
          </select>
          <span className="self-center text-xs text-mid">
            {edit.isPending || copy.isPending || item.allergenConfirmedAt
              ? 'Saved continuously'
              : 'Needs allergen confirmation'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ManualAdd({ add, toast }: { add: ImportMutation; toast: ToastFn }) {
  const [name, setName] = useState('');
  return (
    <form
      className="mt-4 flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        add.mutate(
          { name: name.trim() },
          {
            onSuccess: () => {
              setName('');
              toast({ title: 'Dish added' });
            },
            onError: (err: Error) =>
              toast({
                title: 'Could not add dish',
                description: err.message,
                variant: 'destructive',
              }),
          },
        );
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Dish name"
        aria-label="Missed dish name"
        className="min-h-11 flex-1"
      />
      <Button type="submit" disabled={add.isPending || !name.trim()} className="min-h-11 gap-2">
        <Plus className="h-4 w-4" /> Add dish
      </Button>
    </form>
  );
}
