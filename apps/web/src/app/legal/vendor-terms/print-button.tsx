'use client';

import { Printer } from 'lucide-react';

/**
 * Triggers the browser print dialog so the vendor can Save as PDF.
 * Print styles in globals.css hide the nav, footer, and action buttons.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-600 shadow-sm hover:bg-neutral-50 print:hidden"
      aria-label="Save these terms as a PDF"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden />
      Save as PDF
    </button>
  );
}
