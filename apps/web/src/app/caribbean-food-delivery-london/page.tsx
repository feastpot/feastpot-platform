import type { Metadata } from 'next';

import { CuisineLanding } from '@/components/seo/cuisine-landing';

export const metadata: Metadata = {
  title: 'Caribbean Food Delivery London | Jerk Chicken, Oxtail, Curry Goat',
  description:
    'Order authentic Caribbean food delivered across London — jerk chicken, oxtail, rice and peas, curry goat and festival bread. Independent vendors, FSA-rated kitchens.',
  alternates: { canonical: '/caribbean-food-delivery-london' },
  openGraph: {
    title: 'Caribbean Food Delivery London | Feastpot',
    description: 'Jerk, oxtail, curry goat, rice and peas, festival — delivered across London by independent Caribbean cooks.',
    url: '/caribbean-food-delivery-london',
    type: 'website',
  },
};

export default function Page() {
  return (
    <CuisineLanding
      cuisine="Caribbean"
      heading="Authentic Caribbean Food Delivered in London"
      intro="Brixton, Hackney, Lewisham — wherever you are in London, Feastpot connects you with Caribbean cooks who do the slow-cooked classics properly. Trays for the cookout, family Sundays, or just because it&rsquo;s Friday."
      highlights={[
        { name: 'Jerk Chicken', description: 'Marinated overnight, charcoal-finished where possible. Mild to scotch-bonnet hot.' },
        { name: 'Oxtail', description: 'Slow-braised with butter beans and thyme. Comes with rice and peas as standard.' },
        { name: 'Rice and Peas', description: 'Coconut milk, kidney beans, scotch bonnet whole — never chopped.' },
        { name: 'Curry Goat', description: 'Bone-in goat, properly browned and stewed with Caribbean curry powder.' },
        { name: 'Festival Bread', description: 'Sweet fried dumplings — the right side for jerk and saltfish.' },
        { name: 'Ackee & Saltfish', description: 'The Jamaican national dish, served with breadfruit, dumplings or fried plantain.' },
      ]}
      apiCuisines={['Caribbean', 'Jamaican', 'Trinidadian']}
      faqs={[
        {
          question: 'Which London areas do you cover?',
          answer:
            'Caribbean vendors on Feastpot deliver across Greater London, with strongest coverage in South (Brixton, Streatham, Lewisham), East (Hackney, Stratford) and North (Harlesden, Tottenham).',
        },
        {
          question: 'How far in advance should I order?',
          answer:
            'For weekday meals, 24 hours notice is usually fine. Cookout trays and large jerk pan orders need 48–72 hours so vendors can prep meat properly.',
        },
        {
          question: 'Can I order for an event or street party?',
          answer:
            'Yes — many vendors offer pan-sized portions for events. Add guest count and event time in the order notes so the vendor can confirm timings with you directly.',
        },
        {
          question: 'What if my order arrives late or wrong?',
          answer:
            'Raise a dispute from your order page within 24 hours. We resolve disputes within 24 hours and refund approved cases within 5 business days.',
        },
      ]}
    />
  );
}
