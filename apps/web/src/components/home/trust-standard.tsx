import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { AlertCircle, BadgeCheck, CreditCard, MapPin, ShieldCheck, Star } from 'lucide-react';

/**
 * "How we help you order with confidence" - six trust credentials, each backed
 * by a real schema field or platform integration. Placed after the reviews
 * section so it reinforces confidence before the waitlist / vendor CTA.
 *
 * Schema backing for every claim:
 *   1. Food business registration checked     - VendorApplication.hygiene_reg_number
 *   2. Hygiene rating verified on profiles    - VendorVerification.fhrsRating (min 3/5 enforced)
 *   3. Allergen information on every dish     - MenuItem.allergens[]
 *   4. Verified reviews from real orders      - Review.is_verified (linked to Order)
 *   5. Secure card payment through Stripe     - Payment model / Stripe integration
 *   6. Delivery coverage confirmed by postcode- Coverage endpoint + cookie gate
 *
 * Vendor requirements (used in sub-text) sourced from PLATFORM_FACTS so
 * they stay in sync with the help FAQ and become-a-vendor page.
 */
const TRUST_ITEMS = [
  {
    Icon: BadgeCheck,
    tone: 'brand' as const,
    title: 'Food business registration checked',
    sub: 'Registration number recorded for every vendor.',
  },
  {
    Icon: ShieldCheck,
    tone: 'vendor' as const,
    title: 'Hygiene rating verified on every profile',
    sub: `FSA rating of ${PLATFORM_FACTS.vendorRequirements.find((r) => r.startsWith('FHRS'))?.replace('FHRS rating of at least ', '').replace(' (4 recommended)', '') ?? '3/5'} minimum required before any vendor goes live.`,
  },
  {
    Icon: AlertCircle,
    tone: 'scotch' as const,
    title: 'Allergen information on every dish',
    sub: 'Allergens listed per menu item.',
  },
  {
    Icon: Star,
    tone: 'plantain' as const,
    title: 'Verified reviews from real orders',
    sub: 'Reviews are tied to a completed, delivered order.',
  },
  {
    Icon: CreditCard,
    tone: 'brand' as const,
    title: 'Secure card payment through Stripe',
    sub: 'Card data never touches our servers.',
  },
  {
    Icon: MapPin,
    tone: 'vendor' as const,
    title: 'Delivery coverage confirmed by postcode',
    sub: 'You only see vendors that can reach you.',
  },
] as const;

const TONE: Record<(typeof TRUST_ITEMS)[number]['tone'], string> = {
  brand: 'bg-brand-light text-brand',
  vendor: 'bg-vendor/10 text-vendor',
  scotch: 'bg-scotch/10 text-scotch',
  plantain: 'bg-plantain/15 text-[#8a6a00]',
};

export function TrustStandard() {
  return (
    <section
      aria-labelledby="trust-standard-heading"
      className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
        Order with confidence
      </p>
      <h2
        id="trust-standard-heading"
        className="mt-1 font-display text-[26px] font-black leading-tight text-charcoal sm:text-3xl"
      >
        How we help you order with confidence
      </h2>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TRUST_ITEMS.map(({ Icon, tone, title, sub }) => (
          <li
            key={title}
            className="flex items-start gap-4 rounded-2xl border border-cream-deep bg-white p-5 shadow-card"
          >
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE[tone]}`}
              aria-hidden
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-snug text-charcoal">{title}</p>
              <p className="mt-0.5 text-[12px] font-medium leading-snug text-charcoal-mid">{sub}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
