/**
 * Content data for the eight static occasion landing pages
 * (/occasions/[slug]). Copy only — no vendor names, menu items, prices
 * or availability may appear here: the postcode form remains the gate.
 */

export interface OccasionFaq {
  question: string;
  answer: string;
}

export interface OccasionContent {
  slug: string;
  /** Occasion-specific H1. */
  h1: string;
  /** Supporting copy: typical portion sizes and lead times. */
  intro: string[];
  faqs: [OccasionFaq, OccasionFaq, OccasionFaq];
  metaTitle: string;
  metaDescription: string;
}

export const OCCASION_SLUGS = [
  'sunday-family-meal',
  'birthday-party-trays',
  'wedding-and-events',
  'office-catering',
  'weekly-meal-prep',
  'baby-shower-food',
  'small-chops',
  'frozen-soup-packs',
] as const;

export type OccasionSlug = (typeof OCCASION_SLUGS)[number];

export const OCCASIONS: Record<OccasionSlug, OccasionContent> = {
  'sunday-family-meal': {
    slug: 'sunday-family-meal',
    h1: 'African and Caribbean Sunday family meals, cooked by local cooks',
    intro: [
      'Sunday dinner without spending the weekend at the stove. Local African and Caribbean cooks prepare family pots of jollof, egusi, curry goat, rice and peas and more, then deliver them ready to serve.',
      'A typical family pot feeds 4 to 6 people; larger households usually order two pots or add sides like fried plantain. Most cooks ask for orders by Thursday or Friday for Sunday delivery, so it pays to plan a couple of days ahead.',
    ],
    faqs: [
      {
        question: 'How many people does a family pot feed?',
        answer:
          'Most family pots serve 4 to 6 adults. Portion guidance is shown on each dish once you have entered your postcode and picked a cook.',
      },
      {
        question: 'How far in advance do I need to order for Sunday?',
        answer:
          'Most cooks close Sunday orders on Thursday or Friday evening so they can shop and prepare fresh. Each cook shows their own cut-off before you pay.',
      },
      {
        question: 'Can I schedule the same order every week?',
        answer:
          'Yes. Once you have found a cook you love, you can reorder in a couple of taps and schedule the delivery day that suits your family.',
      },
    ],
    metaTitle: 'Sunday Family Meals — African & Caribbean Food Delivered',
    metaDescription:
      'Order African and Caribbean Sunday family meals from trusted local cooks. Family pots that feed 4-6, scheduled delivery, order by Thursday or Friday for Sunday.',
  },
  'birthday-party-trays': {
    slug: 'birthday-party-trays',
    h1: 'African and Caribbean party trays for birthdays',
    intro: [
      'Feed a birthday crowd properly. Local cooks prepare full-size party trays of jollof, jerk chicken, fried rice, moi moi and small chops, delivered ready for the table.',
      'A standard party tray serves 8 to 12 guests; for bigger parties most hosts order one tray of each dish per 10 guests. Cooks typically need 3 to 5 days notice for party orders, and popular weekend dates can book out earlier.',
    ],
    faqs: [
      {
        question: 'How many guests does a party tray serve?',
        answer:
          'A full-size tray typically serves 8 to 12 guests depending on the dish and how many other dishes you are serving. Exact portion notes appear on each tray once you have entered your postcode.',
      },
      {
        question: 'How much notice do cooks need for a birthday order?',
        answer:
          'Most cooks ask for 3 to 5 days notice for party trays, and busy weekend dates can close earlier. Each cook shows their own cut-off time before checkout.',
      },
      {
        question: 'Can I mix dishes across one delivery?',
        answer:
          'Yes. You can build an order with several trays and sides from the same cook and have everything arrive together on your chosen date.',
      },
    ],
    metaTitle: 'Birthday Party Trays — African & Caribbean Catering',
    metaDescription:
      'Order African and Caribbean birthday party trays from local cooks. Trays serve 8-12 guests, 3-5 days notice, delivered ready to serve on your date.',
  },
  'wedding-and-events': {
    slug: 'wedding-and-events',
    h1: 'African and Caribbean catering for weddings and events',
    intro: [
      'Weddings, church programmes, funerals and family gatherings deserve proper food. Experienced local cooks cater events with full menus of rice dishes, stews, grills and sides, portioned for your guest count.',
      'Event catering is usually priced per head or per tray, with one tray covering roughly 10 guests. Cooks generally ask for 1 to 3 weeks notice for events, and large bookings may involve a quote and a deposit before the date is confirmed.',
    ],
    faqs: [
      {
        question: 'How is event catering portioned?',
        answer:
          'Most cooks work per tray, with one tray covering roughly 10 guests, or will quote per head for larger menus. Share your guest count and the cook will recommend quantities.',
      },
      {
        question: 'How far ahead should I book an event?',
        answer:
          'For weddings and large events, 1 to 3 weeks notice is typical; popular dates go earlier. Smaller gatherings can often be arranged with less notice.',
      },
      {
        question: 'Can I get a quote before committing?',
        answer:
          'Yes. For event orders you can describe your occasion and guest count, and the cook responds with a quote before you pay anything.',
      },
    ],
    metaTitle: 'Wedding & Event Catering — African & Caribbean',
    metaDescription:
      'African and Caribbean catering for weddings, church programmes and gatherings. Local cooks, per-tray or per-head portions, quotes for large events.',
  },
  'office-catering': {
    slug: 'office-catering',
    h1: 'African and Caribbean office catering for teams',
    intro: [
      'Give the team a lunch to talk about. Local cooks deliver African and Caribbean spreads to workplaces — jollof and jerk trays, vegetarian options and sides, portioned for your headcount.',
      'For office lunches, plan one tray per 8 to 10 colleagues plus a side each. Most cooks ask for at least 2 to 3 working days notice for weekday deliveries, with morning cut-offs for end-of-week orders.',
    ],
    faqs: [
      {
        question: 'How much food should I order per person?',
        answer:
          'A tray between 8 to 10 colleagues plus a side each is the usual starting point. Portion notes on each tray help you scale up for bigger teams.',
      },
      {
        question: 'How much notice do cooks need for a weekday delivery?',
        answer:
          'Most cooks need 2 to 3 working days for office orders. Each cook displays their own cut-off before you confirm.',
      },
      {
        question: 'Are vegetarian and halal options available?',
        answer:
          'Many cooks offer vegetarian dishes and halal preparation. Enter your postcode to see which cooks near your office cater for your team’s requirements.',
      },
    ],
    metaTitle: 'Office Catering — African & Caribbean Team Lunches',
    metaDescription:
      'African and Caribbean office catering from local cooks. Trays for 8-10 colleagues, vegetarian and halal options, 2-3 days notice for weekday delivery.',
  },
  'weekly-meal-prep': {
    slug: 'weekly-meal-prep',
    h1: 'African and Caribbean weekly meal prep, portioned for your week',
    intro: [
      'Home cooking for the week without the cooking. Local cooks prepare individual portions of stews, rice dishes and soups, packed so you can fridge or freeze them and eat well every day.',
      'A typical weekly order is 4 to 6 single portions per person; most containers keep 3 to 4 days in the fridge and longer frozen. Cooks usually deliver meal-prep orders on a set day each week, with cut-offs 2 to 3 days before.',
    ],
    faqs: [
      {
        question: 'How many portions should I order for one person?',
        answer:
          'Most customers order 4 to 6 single portions per person per week, mixing dishes so lunches and dinners stay interesting.',
      },
      {
        question: 'How long do the meals keep?',
        answer:
          'Most dishes keep 3 to 4 days refrigerated, and stews and soups freeze well for later in the week. Each cook includes storage guidance with the order.',
      },
      {
        question: 'When do I need to order for next week?',
        answer:
          'Cooks typically deliver meal prep on a fixed day and close orders 2 to 3 days before. You can reorder your usual selection in a couple of taps.',
      },
    ],
    metaTitle: 'Weekly Meal Prep — African & Caribbean Portions',
    metaDescription:
      'African and Caribbean weekly meal prep from local cooks. Single portions, fridge- and freezer-friendly, scheduled weekly delivery to your postcode.',
  },
  'baby-shower-food': {
    slug: 'baby-shower-food',
    h1: 'African and Caribbean baby shower food, delivered for the celebration',
    intro: [
      'Celebrate the new arrival with food the aunties will approve of. Local cooks prepare beautiful trays of rice dishes, grills, salads and small chops sized for family celebrations.',
      'For baby showers, one tray per 10 guests plus a couple of small-chops platters is a common spread. Most cooks ask for 3 to 5 days notice, with weekend dates best booked a week ahead.',
    ],
    faqs: [
      {
        question: 'How much food do I need for a baby shower?',
        answer:
          'Plan one tray per 10 guests plus a small-chops platter or two for grazing. Portion details on each tray help you fine-tune once you have entered your postcode.',
      },
      {
        question: 'How far ahead should I order?',
        answer:
          'Most cooks want 3 to 5 days notice for celebration trays, and Saturday and Sunday dates are best secured about a week ahead.',
      },
      {
        question: 'Can the food arrive ready to serve?',
        answer:
          'Yes. Trays arrive prepared and presentation-ready, so you can go straight from delivery to the buffet table.',
      },
    ],
    metaTitle: 'Baby Shower Food — African & Caribbean Trays',
    metaDescription:
      'Order African and Caribbean baby shower trays from local cooks. One tray per 10 guests, 3-5 days notice, delivered ready to serve.',
  },
  'small-chops': {
    slug: 'small-chops',
    h1: 'Small chops delivery: puff puff, samosa, spring rolls and more',
    intro: [
      'The platters no Nigerian party is complete without. Local cooks prepare fresh small chops — puff puff, samosa, spring rolls, mini sausages, gizzard and peppered snails — arranged ready for guests.',
      'A standard small-chops platter serves 6 to 8 as a starter or side; party hosts usually plan one platter per 6 guests. Fresh platters generally need 2 to 4 days notice, with larger party orders closing earlier.',
    ],
    faqs: [
      {
        question: 'How many people does a small-chops platter serve?',
        answer:
          'A standard platter serves 6 to 8 people as a starter or side. For parties, one platter per 6 guests keeps the table stocked.',
      },
      {
        question: 'How much notice do cooks need?',
        answer:
          'Most cooks ask for 2 to 4 days notice for fresh platters, and larger party orders can close earlier. Each cook shows their cut-off before you pay.',
      },
      {
        question: 'What usually comes on a platter?',
        answer:
          'Classics include puff puff, samosa, spring rolls, mini sausages and gizzard, with each cook offering their own combinations once you have entered your postcode.',
      },
    ],
    metaTitle: 'Small Chops Delivery — Puff Puff, Samosa & More',
    metaDescription:
      'Fresh small chops platters from local cooks: puff puff, samosa, spring rolls and more. Platters serve 6-8, order 2-4 days ahead.',
  },
  'frozen-soup-packs': {
    slug: 'frozen-soup-packs',
    h1: 'Frozen African soup packs: stock the freezer with proper home food',
    intro: [
      'Egusi, ogbono, okra, afang, pepper soup — cooked properly, frozen fresh and delivered in meal-sized packs so home food is always minutes away.',
      'Packs typically come in 1-litre portions that serve 2 to 3 with swallow or rice; most customers order 4 to 6 packs at a time. Because packs are made to order, cooks usually ask for 2 to 4 days notice, and the food keeps for up to 3 months frozen.',
    ],
    faqs: [
      {
        question: 'How many servings are in a pack?',
        answer:
          'A typical 1-litre pack serves 2 to 3 people alongside swallow, rice or yam. Each cook lists exact pack sizes once you have entered your postcode.',
      },
      {
        question: 'How long do frozen packs keep?',
        answer:
          'Kept frozen, most soups are best within 3 months. Every pack comes labelled with storage and reheating guidance.',
      },
      {
        question: 'How much notice do cooks need?',
        answer:
          'Packs are cooked to order, so most cooks ask for 2 to 4 days notice before delivery. Their exact cut-off is shown before checkout.',
      },
    ],
    metaTitle: 'Frozen Soup Packs — Egusi, Ogbono & Pepper Soup',
    metaDescription:
      'Frozen African soup packs from local cooks: egusi, ogbono, okra and pepper soup. 1-litre packs serve 2-3, keep 3 months frozen, made to order.',
  },
};

export function isOccasionSlug(slug: string): slug is OccasionSlug {
  return (OCCASION_SLUGS as readonly string[]).includes(slug);
}
