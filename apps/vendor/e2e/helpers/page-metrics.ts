/**
 * PageMetrics - per-task click, navigation, and timing instrumentation.
 *
 * Usage:
 *   const m = new PageMetrics(page);
 *   await m.install();          // inject click counter (call before goto)
 *   await page.goto('/menu');
 *   m.startTask();              // zero the nav list and start the timer
 *   // ... perform the task ...
 *   m.assertNoNavigation('T1'); // fail if any main-frame navigation fired
 *   m.assertElapsed(90, 'T1');  // fail if wall-clock time exceeded limit
 *   const n = await m.clicks(); // total document click events
 */
import type { Page } from '@playwright/test';

export class PageMetrics {
  private navUrls: string[] = [];
  private navListener: ((frame: import('@playwright/test').Frame) => void) | null = null;
  private taskStartMs = 0;

  constructor(private readonly page: Page) {}

  /** Inject the click counter into every page load. Call before the first goto(). */
  async install(): Promise<void> {
    await this.page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__fp_clicks'] = 0;
      document.addEventListener(
        'click',
        () => {
          const w = window as unknown as Record<string, unknown>;
          w['__fp_clicks'] = ((w['__fp_clicks'] as number) ?? 0) + 1;
        },
        { capture: true },
      );
    });
  }

  /** Reset the navigation list and start the elapsed timer. Call after page load. */
  startTask(): void {
    this.navUrls = [];
    this.taskStartMs = Date.now();

    if (this.navListener) {
      this.page.removeListener('framenavigated', this.navListener);
    }

    this.navListener = (frame: import('@playwright/test').Frame) => {
      if (frame === this.page.mainFrame()) {
        this.navUrls.push(frame.url());
      }
    };

    this.page.on('framenavigated', this.navListener);
  }

  /** Stop recording navigations (e.g. before an intentional reload in T5). */
  stopTask(): void {
    if (this.navListener) {
      this.page.removeListener('framenavigated', this.navListener);
      this.navListener = null;
    }
  }

  /** Wall-clock seconds since startTask(). */
  elapsedSec(): number {
    return (Date.now() - this.taskStartMs) / 1000;
  }

  /** Total document click events since the last page load. */
  async clicks(): Promise<number> {
    return this.page.evaluate(
      () => ((window as unknown as Record<string, number>)['__fp_clicks'] ?? 0),
    );
  }

  /** Throw if any main-frame navigation occurred since startTask(). */
  assertNoNavigation(taskLabel: string): void {
    if (this.navUrls.length === 0) return;
    throw new Error(
      `${taskLabel}: task triggered ${this.navUrls.length} unexpected full-page navigation(s):\n` +
        this.navUrls.map((u) => `  -> ${u}`).join('\n') +
        '\nThe single-screen requirement is broken - no task should ever navigate away from /menu.',
    );
  }

  /** Throw if elapsed time exceeded maxSec. */
  assertElapsed(maxSec: number, taskLabel: string): void {
    const elapsed = this.elapsedSec();
    if (elapsed > maxSec) {
      throw new Error(
        `${taskLabel}: task took ${elapsed.toFixed(1)} s, target ceiling was ${maxSec} s. ` +
          'Pass requires efficiency, not just eventual completion.',
      );
    }
  }
}
