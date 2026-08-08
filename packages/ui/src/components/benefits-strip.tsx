import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { Heart, HelpCircle, Store, WalletCards } from 'lucide-react';

/**
 * Four-icon "brand promises" row. Rendered above the Footer on every
 * customer-facing page. Sourced from PLATFORM_FACTS so the support-hours
 * copy stays in sync with the Help page and legal trust strip automatically.
 *
 * Extracted to @feastpot/ui so every app can share a single implementation.
 */
const BENEFITS = [
  { Icon: Store, title: 'Local flavours', body: 'Support local kitchens' },
  { Icon: WalletCards, title: 'Great value', body: 'Fair prices, every time' },
  { Icon: Heart, title: 'Made with care', body: 'Real food, real people' },
  {
    Icon: HelpCircle,
    title: 'Support that answers',
    body: `Email support, ${PLATFORM_FACTS.support.hours}`,
  },
] as const;

export function BenefitsStrip() {
  return (
    <section
      aria-label="Why Feastpot"
      className="border-t border-cream-deep bg-cream px-4 py-5 md:py-6"
    >
      <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
        {BENEFITS.map(({ Icon, title, body }) => (
          <li key={title} className="flex items-center gap-2.5">
            <Icon className="h-5 w-5 shrink-0 text-plantain" aria-hidden />
            <div className="min-w-0">
              <p className="text-[12px] font-bold leading-tight text-charcoal">{title}</p>
              <p className="mt-0.5 text-[11px] font-medium leading-tight text-charcoal-mid">
                {body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
