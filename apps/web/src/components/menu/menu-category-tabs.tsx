'use client';

import { cn } from '@feastpot/ui';

interface Category {
  key: string;
  label: string;
  count: number;
}

interface Props {
  categories: Category[];
}

/**
 * Sticky horizontal-scroll category tabs for the vendor profile menu.
 *
 * Click handler uses native `scrollIntoView({behavior:'smooth'})` and relies
 * on each menu section setting `scroll-margin-top` so the section header
 * lands below the topnav + this tab strip rather than behind them. We
 * deliberately do NOT track an "active" tab via IntersectionObserver here:
 * that adds re-render churn during scroll and the menu sections are short
 * enough that a static tab strip is the better trade for v1.
 *
 * The tab strip is sticky just below the topnav (`top: var(--page-safe-top)`
 * — defined in globals.css to include the iOS safe-area inset).
 */
export function MenuCategoryTabs({ categories }: Props) {
  if (categories.length === 0) return null;

  const handleClick = (key: string) => {
    const el = document.getElementById(`menu-cat-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      aria-label="Menu categories"
      className={cn(
        'sticky z-20 -mx-4 border-b border-border bg-white/90 backdrop-blur',
      )}
      style={{ top: 'var(--page-safe-top)' }}
    >
      <ul className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => handleClick(c.key)}
              className="touch-target whitespace-nowrap rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-dark transition-colors hover:bg-brand-light"
            >
              {c.label}
              <span className="ml-1 text-[10px] font-normal text-mid">{c.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
