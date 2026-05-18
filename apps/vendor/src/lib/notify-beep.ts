/**
 * Browser notification chime, generated on the fly via the Web Audio API.
 *
 * We avoid shipping an mp3 + the `use-sound` dep because:
 *  - It's a single ~50ms tone - pulling Howler.js for that is overkill.
 *  - Audio assets need bundler/static-asset wiring; an oscillator avoids it.
 *  - `use-sound` is loosely maintained.
 *
 * Browsers block AudioContext until the page has had a user gesture, so the
 * first chime after page load may be silent until the vendor clicks anywhere
 * - that's acceptable for a tab they actively work in.
 */
let cachedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (cachedCtx) return cachedCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  cachedCtx = new Ctor();
  return cachedCtx;
}

/** Play a short two-note chime. No-op on SSR or in browsers without Web Audio. */
export function playOrderChime(): void {
  const ctx = getCtx();
  if (!ctx) return;

  // Resume in case the context was suspended by autoplay policy.
  if (ctx.state === 'suspended') void ctx.resume();

  const playTone = (freq: number, startOffset: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Quick attack/decay envelope so it sounds like a chime, not a beep.
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + startOffset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + startOffset);
    osc.stop(ctx.currentTime + startOffset + duration + 0.05);
  };

  playTone(880, 0, 0.18);
  playTone(1320, 0.16, 0.22);
}
