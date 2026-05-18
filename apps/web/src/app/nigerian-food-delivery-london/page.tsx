import type { Metadata } from 'next';

import { CuisineLanding } from '@/components/seo/cuisine-landing';

export const metadata: Metadata = {
  title: 'Nigerian Food Delivery London | Jollof Rice, Egusi, Suya',
  description:
    'Order authentic Nigerian food delivered across London - jollof rice, egusi soup, pepper soup, suya, pounded yam and small chops. Trays for parties or family-size portions, delivered the same week.',
  alternates: { canonical: '/nigerian-food-delivery-london' },
  openGraph: {
    title: 'Nigerian Food Delivery London | Feastpot',
    description:
      'Jollof, egusi, suya, pepper soup and pounded yam - delivered across London by independent Nigerian cooks.',
    url: '/nigerian-food-delivery-london',
    type: 'website',
  },
};

export default function Page() {
  return (
    <CuisineLanding
      cuisine="Nigerian"
      heading="Authentic Nigerian Food Delivered in London"
      intro="From Peckham to Stratford, Feastpot connects you with home cooks and small kitchens making the Nigerian food you actually grew up eating. Trays for parties, family-size portions, or weekly meal prep - all from vetted vendors with FSA hygiene ratings."
      highlights={[
        { name: 'Jollof Rice', description: 'Smoky party jollof, cooked with stockfish or chicken. Tray sizes for 4–40.' },
        { name: 'Egusi Soup', description: 'Melon-seed soup with spinach and assorted meat. Pairs with pounded yam or eba.' },
        { name: 'Pepper Soup', description: 'Light, peppery broth with goat, catfish or assorted. Comfort food for cold London nights.' },
        { name: 'Suya', description: 'Charcoal-grilled beef skewers dusted with yaji spice. Order by the bundle for sharing.' },
        { name: 'Pounded Yam', description: 'Hand-pounded or instant - vendors will tell you which. Always served fresh.' },
        { name: 'Small Chops', description: 'Puff-puff, samosas, spring rolls, peppered gizzard. The classic party platter.' },
      ]}
      faqs={[
        {
          question: 'What areas of London do you deliver to?',
          answer:
            'Most of our Nigerian vendors cover Greater London, with the densest coverage in South East (Peckham, Lewisham, Catford), East (Stratford, Ilford, Romford) and North (Tottenham, Wood Green). Enter your postcode on the homepage to see who delivers to you.',
        },
        {
          question: 'How far in advance should I order?',
          answer:
            'For party trays we recommend 48–72 hours notice; weekday family orders are usually fulfilled same week. Each vendor sets their own lead time - it is shown at checkout.',
        },
        {
          question: 'Can I get halal Nigerian food?',
          answer:
            'Yes. Use the “Halal” filter on the vendor search to only see vendors who cook to halal standards.',
        },
        {
          question: 'How do refunds work if something goes wrong?',
          answer:
            'Open a dispute from your order page within 24 hours. Our support team reviews evidence within one working day and refunds approved disputes within 5 business days.',
        },
      ]}
    />
  );
}
