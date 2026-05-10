import type { Metadata } from 'next';

import { CuisineLanding } from '@/components/seo/cuisine-landing';

export const metadata: Metadata = {
  title: 'Ghanaian Food Delivery London | Waakye, Banku, Fufu, Jollof',
  description:
    'Order authentic Ghanaian food delivered in London — waakye, banku with tilapia, fufu and light soup, kelewele and jollof. Independent Ghanaian cooks, full FSA hygiene ratings.',
  alternates: { canonical: '/ghanaian-food-delivery-london' },
  openGraph: {
    title: 'Ghanaian Food Delivery London | Feastpot',
    description: 'Waakye, banku, fufu, kelewele and Ghanaian jollof — delivered across London by independent home cooks.',
    url: '/ghanaian-food-delivery-london',
    type: 'website',
  },
};

export default function Page() {
  return (
    <CuisineLanding
      cuisine="Ghanaian"
      heading="Authentic Ghanaian Food Delivered in London"
      intro="From Tottenham to Croydon, Feastpot brings you trusted Ghanaian cooks making waakye, fufu, banku and the kind of jollof worth arguing about. Order a single bowl or a tray that feeds your whole compound."
      highlights={[
        { name: 'Waakye', description: 'Rice and beans cooked with sorghum leaves, served with shito, gari, fish or wele.' },
        { name: 'Banku & Tilapia', description: 'Fermented corn-and-cassava dough with grilled tilapia and fresh pepper.' },
        { name: 'Fufu & Light Soup', description: 'Pounded plantain or cassava in a clear, fiery soup with goat or chicken.' },
        { name: 'Kelewele', description: 'Spiced fried plantain — the snack everyone underestimates until they try it.' },
        { name: 'Ghanaian Jollof', description: 'Long-grain, smoky and tomato-forward. Yes, it is different from Nigerian jollof. Yes, both are great.' },
        { name: 'Red Red & Plantain', description: 'Bean stew with palm oil, served with sweet ripe plantain. The midweek favourite.' },
      ]}
      faqs={[
        {
          question: 'What areas of London do you deliver to?',
          answer:
            'Our Ghanaian vendors are concentrated in North London (Tottenham, Wood Green, Edmonton), East (Hackney, Stratford) and South (Croydon, Thornton Heath). Postcode coverage is shown on each vendor profile.',
        },
        {
          question: 'How far in advance do I need to order?',
          answer:
            'Most vendors take orders 24–48 hours ahead so they can shop fresh. Trays for events typically need 72 hours notice.',
        },
        {
          question: 'Do you do catering for funerals and naming ceremonies?',
          answer:
            'Yes — most vendors offer larger tray sizes for events. Use the order notes to share guest counts and dietary needs.',
        },
        {
          question: 'How do refunds work?',
          answer:
            'Raise a dispute from the order page within 24 hours of delivery. Our team reviews evidence and refunds approved disputes within 5 business days.',
        },
      ]}
    />
  );
}
