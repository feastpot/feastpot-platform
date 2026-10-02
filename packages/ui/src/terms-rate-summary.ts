/**
 * Current-version change notes are a signpost, not a second rate schedule.
 * Retain the stored legal text and historical metadata; remove the obsolete
 * numeric commission note only when presenting the current agreement.
 */
export function currentTermsChangeNotes(summary: string): string[] {
  return summary
    .split('\n')
    .filter(Boolean)
    .map((line) =>
      /^Added: commission rate stated explicitly \([^)]*\)\.$/i.test(line)
        ? 'Added: commission rates and calculation bases are set out in the Rate Schedule (Annex A).'
        : line,
    );
}
