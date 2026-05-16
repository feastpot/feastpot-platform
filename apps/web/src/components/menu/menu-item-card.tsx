'use client';

import { Info, Minus, Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { cn, Sheet, SheetContent } from '@feastpot/ui';

import type { VendorMenuItem } from '@/lib/api/vendors';
import {
  CrossVendorBasketError,
  useBasketStore,
  type BasketVendor,
} from '@/store/basket.store';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

/**
 * Dietary flags are stored snake-cased server-side (`gluten_free`,
 * `dairy_free`) but the older UI was filtering kebab-case (`gluten-free`),
 * which silently dropped them. We accept BOTH forms here and normalise to
 * the human label so we don't lose data on the way to the screen.
 *
 * Halal is treated specially below the chip row (its own Yam-Green pill)
 * because the audit calls it out as the single most important dietary
 * signal for the diaspora customer base — burying it in a generic chip
 * row alongside "Vegan" and "Nut free" undersells it.
 */
const DIETARY_LABELS: Record<string, { label: string; icon: string }> = {
  vegan: { label: 'Vegan', icon: '🌱' },
  vegetarian: { label: 'Vegetarian', icon: '🥗' },
  halal: { label: 'Halal', icon: '☪️' },
  kosher: { label: 'Kosher', icon: '🔵' },
  gluten_free: { label: 'Gluten free', icon: '⚪️' },
  'gluten-free': { label: 'Gluten free', icon: '⚪️' },
  dairy_free: { label: 'Dairy free', icon: '🥛' },
  'dairy-free': { label: 'Dairy free', icon: '🥛' },
  nut_free: { label: 'Nut free', icon: '🥜' },
  'nut-free': { label: 'Nut free', icon: '🥜' },
};

/**
 * Category gradient + emoji map used as the placeholder cover when a menu
 * item has no photo. Each gradient terminates in the dish's "natural" hue
 * (red stew, green soup, charred protein, etc.) so the placeholder still
 * communicates the dish category at a glance. Falls back to a neutral
 * brand gradient for unknown categories.
 */
const CATEGORY_GRADIENTS: Record<string, string> = {
  // Wireframe palette — every gradient terminates in a brand hue
  // (green primary, gold rewards, red scotch). Each pair is dark→light
  // so the emoji centered on top reads clearly.
  tray: 'linear-gradient(135deg, #005C2B, #00843D)',
  soup: 'linear-gradient(135deg, #003318, #00843D)',
  protein: 'linear-gradient(135deg, #8B0410, #E30613)',
  swallow: 'linear-gradient(135deg, #5F5E5A, #9B9894)',
  snack: 'linear-gradient(135deg, #B38400, #F6B400)',
  frozen: 'linear-gradient(135deg, #003318, #00843D)',
  bundle: 'linear-gradient(135deg, #070707, #5F5E5A)',
  event: 'linear-gradient(135deg, #8B0410, #F6B400)',
};

const CATEGORY_EMOJI: Record<string, string> = {
  tray: '🍛',
  soup: '🍲',
  protein: '🍗',
  swallow: '🫓',
  snack: '🥟',
  frozen: '❄️',
  bundle: '📦',
  event: '🎉',
};

/**
 * Server encodes spice/portion as TAG PREFIXES inside `tags: string[]`
 * (see api/src/modules/catalogue/menu-items.service.ts). We decode them on
 * read so the card UI doesn't need to know about that encoding choice.
 */
function decodeTags(tags: string[]): {
  spiceLevel: 0 | 1 | 2 | 3;
  portionLabel: string | null;
  dietary: Array<{ key: string; label: string; icon: string }>;
  isHalal: boolean;
} {
  let spiceLevel: 0 | 1 | 2 | 3 = 0;
  let portionLabel: string | null = null;
  const dietary: Array<{ key: string; label: string; icon: string }> = [];
  const seen = new Set<string>();
  let isHalal = false;

  for (const t of tags) {
    if (t.startsWith('spicy-')) {
      const lvl = Number(t.slice('spicy-'.length));
      if (lvl === 1 || lvl === 2 || lvl === 3) spiceLevel = lvl;
    } else if (t.startsWith('portion-')) {
      portionLabel = t.slice('portion-'.length).replace(/-/g, ' ');
    } else {
      const meta = DIETARY_LABELS[t];
      if (meta && !seen.has(meta.label)) {
        if (meta.label === 'Halal') {
          isHalal = true;
          seen.add(meta.label); // don't double-render in the chip row
          continue;
        }
        dietary.push({ key: t, ...meta });
        seen.add(meta.label);
      }
    }
  }

  return { spiceLevel, portionLabel, dietary, isHalal };
}

const SPICE_LABELS = ['', 'Mild heat', 'Medium', 'Hot', 'Extra hot'] as const;

/**
 * Scotch-bonnet spice indicator. Three glyphs always rendered; the
 * unfilled ones drop to 18% opacity so the row reads as a meter, not as
 * an accidental triple-chilli. The label sits to the right in scotch-red
 * so the card answers "how spicy?" at a glance without expanding.
 */
function SpiceDisplay({ level }: { level: number }) {
  if (!level) return null;
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '3px' }}
      aria-label={`Spice level ${level} — ${SPICE_LABELS[Math.min(level, 4)]}`}
    >
      {[1, 2, 3].map((i) => (
        <span key={i} aria-hidden style={{ fontSize: '11px', opacity: i <= level ? 1 : 0.18 }}>
          🌶️
        </span>
      ))}
      <span
        aria-hidden
        className="ml-1 text-[10px] font-bold text-scotch"
      >
        {SPICE_LABELS[Math.min(level, 4)]}
      </span>
    </div>
  );
}

/**
 * Mirrors the store's `makeLineId` so we can look up the current line for
 * inline +/- without re-implementing the store's identity rule. The inline
 * card never sets `customisationNotes`, so the line key is always
 * `<menuItemId>::`. Lines with customisation are managed in the basket
 * drawer where the notes UI lives.
 */
const inlineLineId = (menuItemId: string) => `${menuItemId}::`;

interface Props {
  item: VendorMenuItem;
  /** Full vendor identity passed to the basket store on add. */
  vendor: BasketVendor;
}

/**
 * Menu item card with **inline** +/- quantity bound to the basket store.
 *
 * UX paradigm shift from the previous card: there is no pre-add quantity
 * stepper. The first tap on `+` adds one to the basket immediately, and the
 * +/- pill becomes the live edit surface. This is the standard pattern on
 * Deliveroo/UberEats and removes one full tap per item from the order flow.
 *
 * Cross-vendor: clicking + when the basket holds items from another vendor
 * triggers a confirm() prompt before clearing — same behaviour as the old
 * card. Replacing the native confirm with a Dialog is a future polish.
 */
export function MenuItemCard({ item, vendor }: Props) {
  const items = useBasketStore((s) => s.items);
  const basketVendor = useBasketStore((s) => s.vendor);
  const basketVendorId = basketVendor?.id ?? null;
  const addItem = useBasketStore((s) => s.addItem);
  const removeLine = useBasketStore((s) => s.removeLine);
  const updateLineQuantity = useBasketStore((s) => s.updateLineQuantity);
  const clearBasket = useBasketStore((s) => s.clearBasket);

  const [showAllergens, setShowAllergens] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [crossVendorOpen, setCrossVendorOpen] = useState(false);
  // Single-fire guard so a user mashing "Start new order" can't queue
  // multiple add-after-clear operations on subsequent animation frames
  // (which would silently inflate the line quantity).
  const confirmingCrossVendorRef = useRef(false);

  // Only count the inline (no-customisation) line; customised lines are
  // separate orders from the user's perspective and shown in the drawer.
  const lineId = inlineLineId(item.id);
  const sameVendor = basketVendorId === null || basketVendorId === vendor.id;
  const qty = sameVendor ? items.find((i) => i.lineId === lineId)?.quantity ?? 0 : 0;

  const { spiceLevel, portionLabel, dietary, isHalal } = decodeTags(item.tags);
  const cover = item.imageUrls[0];
  const placeholderGradient =
    CATEGORY_GRADIENTS[item.category] ?? 'linear-gradient(135deg, #00843D, #005C2B)';
  const placeholderEmoji = CATEGORY_EMOJI[item.category] ?? '🍽️';

  const flashPulse = () => {
    setPulse(true);
    setJustAdded(true);
    window.setTimeout(() => setPulse(false), 220);
    // 800ms keyframe — long enough that the eye lands on it after the
    // tap micro-interaction, short enough to not stack confirmations
    // when the user adds two items in quick succession.
    window.setTimeout(() => setJustAdded(false), 800);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  };

  const performAdd = () => {
    addItem(
      {
        menuItemId: item.id,
        menuItemName: item.name,
        quantity: 1,
        unitPricePence: item.pricePence,
        imageUrl: cover,
        portionLabel: portionLabel ?? undefined,
      },
      vendor,
    );
    flashPulse();
  };

  const tryAdd = () => {
    try {
      performAdd();
    } catch (e) {
      if (e instanceof CrossVendorBasketError) {
        // Replaces the older window.confirm() — a native dialog feels
        // jarring on mobile and the message ("Clear basket?") was
        // technical. The bottom-sheet below names BOTH vendors and uses
        // copy a non-technical user can act on.
        setCrossVendorOpen(true);
        return;
      }
      throw e;
    }
  };

  const onConfirmReplaceBasket = () => {
    if (confirmingCrossVendorRef.current) return;
    confirmingCrossVendorRef.current = true;
    clearBasket();
    setCrossVendorOpen(false);
    // Defer the add so the sheet's exit animation isn't competing with
    // the +/- pill swap-in animation on the card. One frame is enough.
    window.requestAnimationFrame(() => {
      performAdd();
      // Release the guard once the add has landed so a *future*
      // legitimate cross-vendor switch on the same card still works.
      confirmingCrossVendorRef.current = false;
    });
  };

  const handleMinus = () => {
    if (qty <= 1) removeLine(lineId);
    else updateLineQuantity(lineId, qty - 1);
  };

  if (!item.isAvailable) {
    return (
      <div className="fp-card flex gap-3 p-3 opacity-50">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover grayscale" />
        ) : (
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-2xl grayscale"
            style={{ background: placeholderGradient }}
            aria-hidden
          >
            {placeholderEmoji}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-dark">{item.name}</p>
          <p className="mt-0.5 text-xs text-mid line-through">{formatPounds(item.pricePence)}</p>
          <p className="mt-1 text-xs text-mid">Currently unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <article
      className={cn(
        'fp-card p-3 transition-transform duration-200',
        pulse && 'scale-[1.01]',
      )}
    >
      <div className="flex gap-3">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-24 w-24 shrink-0 rounded-xl object-cover"
          />
        ) : (
          // Category gradient placeholder + on-brand emoji — beats a
          // generic 🍽️ tile by hinting at the dish type while photos
          // are still being uploaded.
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl text-3xl"
            style={{ background: placeholderGradient }}
            aria-hidden
          >
            {placeholderEmoji}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold leading-tight text-charcoal">{item.name}</h3>

          {/* Spice meter — three scotch-bonnet glyphs with intensity label. */}
          <SpiceDisplay level={spiceLevel} />

          {/* Portion-size pill — wireframe gold on light tint. */}
          {portionLabel && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-plantain/15 px-2 py-0.5 text-[10px] font-bold text-charcoal">
              <span aria-hidden>👥</span>
              <span className="capitalize">{portionLabel}</span>
            </div>
          )}
          {!portionLabel && item.servingsCount && (
            <p className="mt-0.5 text-[11px] font-medium text-charcoal-mid">
              Serves {item.servingsCount}
            </p>
          )}

          {item.description && (
            <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-relaxed text-charcoal-mid">
              {item.description}
            </p>
          )}

          {/* Halal — wireframe brand-green pill, called out separately
              because it materially changes whether a customer can order. */}
          {isHalal && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-brand bg-brand-light px-2 py-0.5 text-[10px] font-bold text-brand-dark">
              <span aria-hidden>☪️</span>
              Halal
            </div>
          )}

          {dietary.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {dietary.map((d) => (
                <li
                  key={d.key}
                  className="inline-flex items-center gap-1 rounded-md bg-brand-light px-1.5 py-0.5 text-[10px] font-bold text-brand-dark"
                >
                  <span aria-hidden>{d.icon}</span>
                  {d.label}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[15px] font-black text-charcoal">
              {formatPounds(item.pricePence)}
            </span>

            {/* Right-side controls. The relative wrapper hosts the
                "Added ✓" floating confirmation OUTSIDE the qty===0
                conditional so it stays visible across the
                Plus-button → +/- pill swap on the very first add (the
                first add is exactly the moment the user most needs the
                confirmation). aria-live so AT users hear the count
                change without the toast being announced as a generic
                aria-live region itself. */}
            <div className="relative">
              {justAdded && (
                <span
                  className="pointer-events-none absolute -top-5 right-0 whitespace-nowrap text-[11px] font-bold text-brand-dark animate-fade-up"
                  aria-hidden
                >
                  Added ✓
                </span>
              )}
              {qty === 0 ? (
                <button
                  type="button"
                  onClick={tryAdd}
                  aria-label={`Add ${item.name} to basket`}
                  className="touch-target flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-sm transition-transform active:scale-90"
                >
                  <Plus className="h-5 w-5" aria-hidden />
                </button>
              ) : (
                <div
                  className={cn(
                    'flex items-center gap-1 rounded-full bg-brand p-1 shadow-sm transition-transform duration-200',
                    pulse && 'scale-110',
                  )}
                >
                {/* +/- pill buttons bumped from 28×28 → 44×44 so each
                    individual control meets WCAG 2.5.5 / Apple HIG.
                    Older / less-precise users (the core demo) were
                    routinely double-tapping the wrong button on the
                    smaller pill. Visible icon size is unchanged
                    (h-4 w-4) — only the hit area grows. */}
                <button
                  type="button"
                  onClick={handleMinus}
                  aria-label={`Decrease ${item.name} quantity`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform active:scale-90"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span
                  className="min-w-5 text-center text-sm font-bold tabular-nums text-white"
                  aria-live="polite"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={tryAdd}
                  aria-label={`Increase ${item.name} quantity`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform active:scale-90"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
                </div>
              )}
            </div>
          </div>

          {item.allergens.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAllergens((s) => !s)}
              aria-expanded={showAllergens}
              // Wireframe red (scotch) for the allergen toggle — allergens
              // are safety-critical so they deserve the urgency colour
              // rather than the muted amber the previous design used.
              // Contrast on white: ~6:1, WCAG AA pass.
              className="touch-target mt-1 -ml-2 inline-flex items-center gap-1.5 rounded-md px-2 text-[12px] font-bold text-scotch transition-opacity hover:opacity-80"
            >
              <Info className="h-4 w-4" aria-hidden />
              {showAllergens ? 'Hide allergens' : 'View allergens'}
            </button>
          )}
          {showAllergens && (
            <p className="mt-1 rounded-lg border border-scotch/20 bg-scotch/10 p-2 text-[12px] font-medium leading-relaxed text-charcoal">
              ⚠️ Contains: {item.allergens.join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* Cross-vendor confirmation. Bottom-sheet (mobile) / right-sheet
          (≥sm) via the shared shadcn Sheet — same chrome as the basket
          drawer so it feels like part of the same system. Names BOTH
          vendors so the user understands the trade-off without having
          to remember what's in their basket.

          A11y: this UI package doesn't re-export SheetTitle /
          SheetDescription helpers, so the title <h2> and description
          <p> are wired up via aria-labelledby / aria-describedby on
          the SheetContent (the underlying Radix Dialog requires both
          for a screen-reader-announceable dialog). The visible
          heading doubles as the AT-announced title, no extra
          sr-only duplicate needed. */}
      <Sheet open={crossVendorOpen} onOpenChange={setCrossVendorOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl"
          aria-labelledby={`cross-vendor-title-${item.id}`}
          aria-describedby={`cross-vendor-desc-${item.id}`}
        >
          <div className="mx-auto max-w-sm py-2">
            <h2
              id={`cross-vendor-title-${item.id}`}
              className="font-display text-base font-black text-charcoal"
            >
              Start a new order?
            </h2>
            <p
              id={`cross-vendor-desc-${item.id}`}
              className="mt-2 text-[13px] font-medium leading-relaxed text-charcoal-mid"
            >
              Your basket has items from{' '}
              <strong className="font-bold text-charcoal">
                {basketVendor?.name ?? 'another kitchen'}
              </strong>
              . Adding from{' '}
              <strong className="font-bold text-charcoal">{vendor.name}</strong> will clear your
              current basket.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCrossVendorOpen(false)}
                className="touch-target flex-1 rounded-xl border border-cream-deep bg-white px-3 py-3 text-sm font-bold text-charcoal-mid transition-colors hover:bg-cream"
              >
                Keep current basket
              </button>
              <button
                type="button"
                onClick={onConfirmReplaceBasket}
                disabled={confirmingCrossVendorRef.current}
                className="touch-target flex-1 rounded-xl bg-brand px-3 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60"
              >
                Start new order
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </article>
  );
}
