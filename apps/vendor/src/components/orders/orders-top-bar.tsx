'use client';

import { Download, RefreshCcw, Search } from 'lucide-react';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  onExport: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/**
 * Row above the orders tabs. Holds the global search input, the
 * Export (CSV of currently-visible orders) and Refresh actions, and
 * the page-level title block lives just above it in
 * `OrdersDashboard`.
 *
 * The mockup also shows a Filters button opening a sheet; the
 * left-rail "Quick filters" card already covers the common cases
 * (high value, has notes) so a separate filters sheet would be
 * redundant for this iteration. Add a Filters button here if/when
 * advanced filtering (date range, dish, postcode) is needed.
 */
export function OrdersTopBar({ search, onSearchChange, onExport, onRefresh, isRefreshing }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mid" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search orders, customers…"
          aria-label="Search orders"
          className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-dark placeholder:text-mid focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-dark transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          <Download className="h-4 w-4" aria-hidden />
          Export
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-teal px-3 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
        >
          <RefreshCcw className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />
          Refresh
        </button>
      </div>
    </div>
  );
}
