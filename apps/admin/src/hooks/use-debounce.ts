import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * silence. The input field itself is never delayed - only the value exposed to
 * downstream query keys / effects is held back, so keyboard feedback remains
 * instant while fetches wait until the user pauses.
 *
 * Unmounting during the delay cancels the pending update, so in-flight
 * results for stale keystrokes are never rendered over newer ones.
 *
 * @param value  The raw value to debounce (any reference-stable or primitive).
 * @param delay  Milliseconds of silence before the debounced value flushes.
 *               Defaults to 300 ms - enough to absorb a fast typist's burst.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
