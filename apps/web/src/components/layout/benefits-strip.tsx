import { Heart, HelpCircle, Store, WalletCards } from 'lucide-react';

/**
 * Wireframe 1/4 "Local flavours / Great value / Made with care / Always
 * here" four-icon row. Lives directly above the legal footer on every
 * page (mounted in layout via the Footer component) so the brand
 * promises are persistently visible.
 *
 * Compact, single-line on desktop; 2-up on mobile.
 */
const BENEFITS = [
  { Icon: Store, title: 'Local flavours', body: 'Support local kitchens' },
  { Icon: WalletCards, title: 'Great value', body: 'Fair prices, every time' },
  { Icon: Heart, title: 'Made with care', body: 'Real food, real people' },
  { Icon: HelpCircle, title: 'Always here', body: '24/7 customer support' },
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
