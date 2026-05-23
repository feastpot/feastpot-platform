/**
 * Continuation seed: Kwame's menu items + 18 diaspora vendors.
 *
 * Skips the Supabase Auth round-trip entirely - looks up vendor users by
 * email from public.users (already created by `npm run db:seed`). Safe to
 * re-run; idempotent via slug + find-or-create menu + wipe-and-recreate
 * menu items per vendor.
 */
import {
  DeliveryType,
  ItemCategory,
  ModerationStatus,
  PrismaClient,
  VendorStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

interface ExtraItemSpec {
  name: string;
  description: string;
  category: ItemCategory;
  pricePence: number;
  servingsCount: number;
  allergens?: string[];
  tags?: string[];
}
interface ExtraVendorSpec {
  userEmail: string;
  slug: string;
  businessName: string;
  description: string;
  cuisines: string[];
  rating: number;
  ratingCount: number;
  collectionAddress: string;
  postcodes: string[];
  localRadiusMiles: number;
  localFeePence: number;
  minOrderPence: number;
  items: ExtraItemSpec[];
}

const EXTRA_VENDORS: ExtraVendorSpec[] = [
  { userEmail: 'punjab.tandoor@feastpot.co.uk', slug: 'punjab-tandoor-southall', businessName: 'Punjab Tandoor', description: 'Punjabi home cooking from a Southall family kitchen - slow-cooked dals, smoky tandoori platters, and party-size biryani trays.', cuisines: ['Indian', 'Punjabi'], rating: 4.7, ratingCount: 18, collectionAddress: '88 The Broadway, Southall, London UB1 1QF', postcodes: ['UB1','UB2','UB3','UB5','TW3','W7'], localRadiusMiles: 7, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Chicken Tikka Biryani (Full Tray)', description: 'Basmati rice layered with marinated chicken tikka and saffron. Serves 10.', category: ItemCategory.tray, pricePence: 3400, servingsCount: 10, tags: ['halal'] },
    { name: 'Dal Makhani (Family Pot)', description: 'Black urad dal slow-simmered overnight with cream and butter. Serves 6.', category: ItemCategory.soup, pricePence: 2200, servingsCount: 6, allergens: ['dairy'], tags: ['vegetarian'] },
    { name: 'Tandoori Mixed Grill (20 skewers)', description: 'Chicken tikka, seekh kebab, lamb chops - straight from the clay oven.', category: ItemCategory.protein, pricePence: 4200, servingsCount: 8, tags: ['halal','spice:2'] },
    { name: 'Garlic Naan (12 pieces)', description: 'Fresh tandoor-baked naan brushed with garlic butter.', category: ItemCategory.snack, pricePence: 1200, servingsCount: 6, allergens: ['gluten','dairy'], tags: ['vegetarian'] },
    { name: 'Punjabi Chole (Full Pot)', description: 'Chickpeas in a tomato-onion masala. Serves 6–8.', category: ItemCategory.soup, pricePence: 1800, servingsCount: 7, tags: ['vegan'] },
    { name: 'Mango Lassi (2L jug)', description: 'Sweet alphonso mango with house-set yoghurt.', category: ItemCategory.snack, pricePence: 900, servingsCount: 8, allergens: ['dairy'], tags: ['vegetarian'] },
  ]},
  { userEmail: 'karachi.biryani@feastpot.co.uk', slug: 'karachi-biryani-house-east-london', businessName: 'Karachi Biryani House', description: 'Bold Karachi-style biryanis, nihari, and haleem from an East London kitchen. Catering for weddings and Friday family lunches.', cuisines: ['Pakistani'], rating: 4.6, ratingCount: 14, collectionAddress: '210 Whitechapel Road, London E1 1BJ', postcodes: ['E1','E2','E3','E14','EC1','N1'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Sindhi Mutton Biryani (Full Tray)', description: 'Spice-forward Sindhi biryani with bone-in mutton. Serves 10.', category: ItemCategory.tray, pricePence: 4200, servingsCount: 10, tags: ['halal','spice:3'] },
    { name: 'Beef Nihari (Full Pot)', description: 'Slow-cooked overnight nihari with bone marrow. Serves 6.', category: ItemCategory.soup, pricePence: 3600, servingsCount: 6, allergens: ['gluten'], tags: ['halal','spice:2'] },
    { name: 'Chicken Haleem (Family Pot)', description: 'Lentils, wheat, and shredded chicken - the Karachi way.', category: ItemCategory.soup, pricePence: 2800, servingsCount: 8, allergens: ['gluten'], tags: ['halal'] },
    { name: 'Seekh Kebab (24 sticks)', description: 'Mince beef seekh on charcoal. Bring your own naan.', category: ItemCategory.protein, pricePence: 2400, servingsCount: 12, tags: ['halal','spice:2'] },
    { name: 'Aloo Paratha (10 pieces)', description: 'Stuffed potato paratha - pan-fried in ghee.', category: ItemCategory.snack, pricePence: 1500, servingsCount: 5, allergens: ['gluten','dairy'], tags: ['vegetarian'] },
  ]},
  { userEmail: 'sylhet.kitchen@feastpot.co.uk', slug: 'sylhet-kitchen-tower-hamlets', businessName: 'Sylhet Kitchen', description: 'Bangladeshi home cooking from Brick Lane - bhuna, shatkora curries, and fish from the Surma valley. Bulk orders for community events.', cuisines: ['Bangladeshi'], rating: 4.7, ratingCount: 9, collectionAddress: '102 Brick Lane, London E1 6RL', postcodes: ['E1','E2','E5','E8','EC2'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Lamb Shatkora Curry (Full Pot)', description: 'Sylheti citrus-fruit curry with bone-in lamb. Serves 8.', category: ItemCategory.soup, pricePence: 3600, servingsCount: 8, tags: ['halal','spice:2'] },
    { name: 'Hilsa Fish Bhuna (Full Pot)', description: 'Mustard-oil hilsa, the national fish of Bangladesh. Serves 6.', category: ItemCategory.soup, pricePence: 4200, servingsCount: 6, allergens: ['fish'], tags: ['halal'] },
    { name: 'Chicken Bhuna (Full Tray)', description: 'Slow-reduced onion-tomato bhuna with bone-in chicken. Serves 10.', category: ItemCategory.tray, pricePence: 3000, servingsCount: 10, tags: ['halal'] },
    { name: 'Pulao Rice (Full Tray)', description: 'Fragrant basmati pulao with bay leaf and cardamom. Serves 12.', category: ItemCategory.tray, pricePence: 1800, servingsCount: 12, tags: ['vegetarian'] },
    { name: 'Bhortas Selection (4 pots)', description: 'Aubergine, dal, tomato, dried-fish bhortas with rice on the side.', category: ItemCategory.bundle, pricePence: 2400, servingsCount: 8, allergens: ['fish'], tags: [] },
  ]},
  { userEmail: 'jaffna.amma@feastpot.co.uk', slug: 'jaffna-amma-tooting', businessName: "Jaffna Amma's Kitchen", description: 'Sri Lankan Tamil home cooking from Tooting - kothu roti, crab curry, and string-hopper trays for big family weekends.', cuisines: ['Sri Lankan','Tamil'], rating: 4.8, ratingCount: 21, collectionAddress: '14 Upper Tooting Road, London SW17 7PG', postcodes: ['SW17','SW16','SW12','CR4','SW18'], localRadiusMiles: 7, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Chicken Kothu Roti (Full Tray)', description: 'Chopped godhamba roti stir-fried with chicken curry. Serves 8.', category: ItemCategory.tray, pricePence: 3000, servingsCount: 8, allergens: ['gluten','egg'], tags: [] },
    { name: 'Jaffna Crab Curry (Full Pot)', description: 'Whole blue crab in a fiery roasted-curry-powder gravy. Serves 4.', category: ItemCategory.soup, pricePence: 4800, servingsCount: 4, allergens: ['crustaceans'], tags: ['spice:3'] },
    { name: 'String Hoppers (50 pieces)', description: 'Steamed rice-flour idiyappam - pair with sothi or dal.', category: ItemCategory.swallow, pricePence: 1800, servingsCount: 8, tags: ['vegan'] },
    { name: 'Coconut Sambol & Pol Roti (Bundle)', description: 'Coconut roti with fresh pol sambol and seeni sambal.', category: ItemCategory.bundle, pricePence: 1400, servingsCount: 6, tags: ['vegan','spice:2'] },
    { name: 'Devilled Prawns (Family Tray)', description: 'Wok-tossed prawns with onion, capsicum, and chilli. Serves 6.', category: ItemCategory.protein, pricePence: 3400, servingsCount: 6, allergens: ['crustaceans'], tags: ['spice:3'] },
  ]},
  { userEmail: 'mama.j.jerk@feastpot.co.uk', slug: 'mama-js-jerk-yard-harlesden', businessName: "Mama J's Jerk Yard", description: 'Jamaican jerk cooked low and slow over pimento wood in a Harlesden back yard. Sunday-dinner trays, ackee Saturdays, and party patty boxes.', cuisines: ['Jamaican','Caribbean'], rating: 4.9, ratingCount: 32, collectionAddress: '64 High Street, Harlesden, London NW10 4LX', postcodes: ['NW10','NW6','W10','W12','HA0','HA9'], localRadiusMiles: 7, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Pimento-Wood Jerk Chicken (Full Tray)', description: '24-hour-marinated jerk chicken, smoked over real pimento wood. Serves 10.', category: ItemCategory.tray, pricePence: 3800, servingsCount: 10, tags: ['spice:2'] },
    { name: 'Curry Goat (Full Pot)', description: 'Bone-in goat in Scotch-bonnet curry. Serves 8.', category: ItemCategory.soup, pricePence: 4400, servingsCount: 8, tags: ['spice:2'] },
    { name: 'Ackee & Saltfish Tray', description: 'National dish - ackee, salt cod, peppers and onions. Serves 6.', category: ItemCategory.tray, pricePence: 3200, servingsCount: 6, allergens: ['fish'], tags: [] },
    { name: 'Rice & Peas (Full Tray)', description: 'Coconut rice with red kidney beans and thyme. Serves 10.', category: ItemCategory.tray, pricePence: 2200, servingsCount: 10, tags: ['vegan'] },
    { name: 'Beef Patties (24 pieces)', description: 'Flaky golden patties with seasoned mince filling.', category: ItemCategory.snack, pricePence: 2400, servingsCount: 12, allergens: ['gluten'], tags: [] },
    { name: 'Festival (20 pieces)', description: 'Sweet Jamaican fried dough - the perfect side for jerk.', category: ItemCategory.snack, pricePence: 1200, servingsCount: 10, allergens: ['gluten'], tags: ['vegan'] },
  ]},
  { userEmail: 'trini.doubles@feastpot.co.uk', slug: 'trini-doubles-stand-finsbury-park', businessName: 'Trini Doubles Stand', description: 'Trinidadian street-food specialists - doubles, roti, pelau and pholourie packs for office lunches and weekend lime sessions.', cuisines: ['Trinidadian','Caribbean'], rating: 4.6, ratingCount: 12, collectionAddress: '7 Stroud Green Road, London N4 2DQ', postcodes: ['N4','N7','N8','N15','N19'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2000, items: [
    { name: 'Doubles (24 pieces)', description: 'Bara flatbreads filled with curry channa and tamarind chutney.', category: ItemCategory.snack, pricePence: 2400, servingsCount: 12, allergens: ['gluten'], tags: ['vegan'] },
    { name: 'Curry Goat Roti Skin Bundle', description: '8 dhalpuri roti with curry goat in a separate pot. Serves 8.', category: ItemCategory.bundle, pricePence: 4200, servingsCount: 8, allergens: ['gluten'], tags: ['halal','spice:2'] },
    { name: 'Chicken Pelau (Full Tray)', description: 'One-pot rice with browned chicken, pigeon peas and coconut. Serves 10.', category: ItemCategory.tray, pricePence: 3000, servingsCount: 10, tags: [] },
    { name: 'Pholourie & Tamarind Sauce (60 pieces)', description: 'Split-pea fritters with sweet-and-sour tamarind dip.', category: ItemCategory.snack, pricePence: 1800, servingsCount: 10, allergens: ['gluten'], tags: ['vegan'] },
    { name: 'Bake & Shark (10 pieces)', description: 'Fried bake stuffed with seasoned shark, slaw, and shadow beni.', category: ItemCategory.snack, pricePence: 3200, servingsCount: 10, allergens: ['fish','gluten'], tags: ['spice:2'] },
  ]},
  { userEmail: 'addis.injera@feastpot.co.uk', slug: 'addis-injera-house-old-kent-road', businessName: 'Addis Injera House', description: 'Authentic Ethiopian wots, kitfo and injera platters - communal dining made for a crowd, prepped in our Old Kent Road kitchen.', cuisines: ['Ethiopian'], rating: 4.8, ratingCount: 17, collectionAddress: '300 Old Kent Road, London SE1 5UE', postcodes: ['SE1','SE15','SE16','SE17','SE5'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Beyaynetu Sharing Platter (Serves 6)', description: 'Vegan combo: shiro, miser wot, gomen, atkilt, on a 14" injera.', category: ItemCategory.tray, pricePence: 3600, servingsCount: 6, tags: ['vegan'] },
    { name: 'Doro Wat (Full Pot)', description: 'Slow-simmered chicken wot with berbere and hard-boiled eggs. Serves 6.', category: ItemCategory.soup, pricePence: 3400, servingsCount: 6, allergens: ['egg'], tags: ['spice:3'] },
    { name: 'Kitfo (Family Tray)', description: 'Hand-minced beef warmed with mitmita and kibe. Serves 4.', category: ItemCategory.protein, pricePence: 4200, servingsCount: 4, allergens: ['dairy'], tags: ['spice:3'] },
    { name: 'Injera (10 pieces)', description: 'Sour teff-flour flatbread, fermented for 3 days.', category: ItemCategory.swallow, pricePence: 1500, servingsCount: 10, tags: ['vegan'] },
    { name: 'Sambusa (24 pieces)', description: 'Crisp fried pastries with spiced lentil filling.', category: ItemCategory.snack, pricePence: 1800, servingsCount: 12, allergens: ['gluten'], tags: ['vegan'] },
  ]},
  { userEmail: 'xawaash.somali@feastpot.co.uk', slug: 'xawaash-somali-kitchen-woolwich', businessName: 'Xawaash Somali Kitchen', description: 'Somali sambusas, suqaar and bariis iskukaris from a Woolwich kitchen. Halal certified, perfect for iftar and family weekends.', cuisines: ['Somali'], rating: 4.7, ratingCount: 11, collectionAddress: '46 Powis Street, Woolwich, London SE18 6LF', postcodes: ['SE18','SE28','SE10','SE9','DA8'], localRadiusMiles: 7, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Bariis Iskukaris (Full Tray)', description: 'Spiced rice with goat shoulder, sultanas and pine nuts. Serves 10.', category: ItemCategory.tray, pricePence: 3600, servingsCount: 10, allergens: ['tree_nuts'], tags: ['halal'] },
    { name: 'Suqaar (Full Pot)', description: 'Cubed beef sautéed with peppers, onions and xawaash spice. Serves 6.', category: ItemCategory.soup, pricePence: 2800, servingsCount: 6, tags: ['halal','spice:2'] },
    { name: 'Sambusa (30 pieces)', description: 'Crisp triangular pastries with spiced beef filling.', category: ItemCategory.snack, pricePence: 1800, servingsCount: 15, allergens: ['gluten'], tags: ['halal'] },
    { name: 'Canjeero Pancakes (20 pieces)', description: 'Light fermented pancakes - eat with honey or suqaar.', category: ItemCategory.snack, pricePence: 1200, servingsCount: 10, allergens: ['gluten'], tags: ['halal','vegetarian'] },
    { name: 'Maraq (Family Pot)', description: 'Hearty Somali soup with lamb, vegetables and lemon. Serves 8.', category: ItemCategory.soup, pricePence: 2600, servingsCount: 8, tags: ['halal'] },
  ]},
  { userEmail: 'ubuntu.braai@feastpot.co.uk', slug: 'ubuntu-braai-collective-clapham', businessName: 'Ubuntu Braai Collective', description: 'South African braai trays, bobotie, and bunny-chow boxes from a Clapham team. Big-batch catering for South African community Sundays.', cuisines: ['South African'], rating: 4.6, ratingCount: 15, collectionAddress: '32 Clapham High Street, London SW4 7UR', postcodes: ['SW4','SW8','SW9','SW11','SW12'], localRadiusMiles: 7, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Boerewors & Pap Tray', description: 'Coiled boerewors, mielie pap and chakalaka relish. Serves 10.', category: ItemCategory.tray, pricePence: 3400, servingsCount: 10, tags: [] },
    { name: 'Bobotie (Family Bake)', description: 'Cape-Malay spiced beef bake with egg custard topping. Serves 8.', category: ItemCategory.tray, pricePence: 3000, servingsCount: 8, allergens: ['egg','dairy','tree_nuts'], tags: [] },
    { name: 'Bunny Chow (6 boxes)', description: 'Hollowed-out half loaves filled with mutton curry. Durban classic.', category: ItemCategory.bundle, pricePence: 3600, servingsCount: 6, allergens: ['gluten'], tags: ['spice:2'] },
    { name: 'Chakalaka & Pap (Family Pot)', description: 'Spicy vegetable relish with white maize porridge. Serves 8.', category: ItemCategory.soup, pricePence: 1800, servingsCount: 8, tags: ['vegan'] },
    { name: 'Biltong Box (500g)', description: 'Air-dried beef biltong - a mix of sliced and stick cuts.', category: ItemCategory.snack, pricePence: 2200, servingsCount: 8, tags: [] },
  ]},
  { userEmail: 'beirut.mezze@feastpot.co.uk', slug: 'beirut-mezze-house-edgware-road', businessName: 'Beirut Mezze House', description: 'Lebanese mezze, charcoal mixed grills and pastries from an Edgware Road kitchen. Catering trays for offices and family parties.', cuisines: ['Lebanese'], rating: 4.8, ratingCount: 22, collectionAddress: '156 Edgware Road, London W2 2DZ', postcodes: ['W2','W9','NW1','NW8','W1'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Mixed Mezze Platter (Serves 8)', description: 'Hummus, moutabal, tabbouleh, fattoush, kibbeh and falafel.', category: ItemCategory.tray, pricePence: 3800, servingsCount: 8, allergens: ['sesame','gluten'], tags: ['halal','vegetarian'] },
    { name: 'Charcoal Mixed Grill (Full Tray)', description: 'Shish taouk, lamb kafta and shish kebab over charcoal. Serves 8.', category: ItemCategory.tray, pricePence: 4400, servingsCount: 8, tags: ['halal','spice:1'] },
    { name: 'Falafel & Pita Box (40 falafel)', description: 'Fresh-fried falafel with pita, tahini and pickled turnips.', category: ItemCategory.bundle, pricePence: 2400, servingsCount: 10, allergens: ['sesame','gluten'], tags: ['halal','vegan'] },
    { name: 'Manakeesh Selection (24 pieces)', description: "Za'atar, cheese, and lamb-spiced flatbreads.", category: ItemCategory.snack, pricePence: 2200, servingsCount: 12, allergens: ['gluten','dairy'], tags: ['halal','vegetarian'] },
    { name: 'Baklava Tray (40 pieces)', description: 'Pistachio and walnut baklava in rosewater syrup.', category: ItemCategory.snack, pricePence: 2400, servingsCount: 20, allergens: ['gluten','tree_nuts'], tags: ['halal','vegetarian'] },
  ]},
  { userEmail: 'istanbul.ocakbasi@feastpot.co.uk', slug: 'istanbul-ocakbasi-dalston', businessName: 'Istanbul Ocakbasi', description: 'Turkish ocakbasi (charcoal grill) catering - adana, lahmacun, pide and lahmajun trays from a Dalston kitchen.', cuisines: ['Turkish'], rating: 4.7, ratingCount: 19, collectionAddress: '74 Kingsland High Street, London E8 2NS', postcodes: ['E8','N1','N16','E5','E9'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Adana Kebab (Full Tray)', description: 'Hand-minced lamb adana skewers over charcoal. Serves 10.', category: ItemCategory.tray, pricePence: 4200, servingsCount: 10, tags: ['halal','spice:2'] },
    { name: 'Lahmacun (24 pieces)', description: 'Thin Turkish flatbreads with spiced lamb topping.', category: ItemCategory.snack, pricePence: 2400, servingsCount: 12, allergens: ['gluten'], tags: ['halal'] },
    { name: 'Pide Selection (8 boats)', description: 'Cheese, sucuk, and minced-lamb pide boats.', category: ItemCategory.bundle, pricePence: 2800, servingsCount: 8, allergens: ['gluten','dairy'], tags: ['halal'] },
    { name: 'Iskender Tray (Serves 6)', description: 'Sliced döner over pide with tomato sauce and yoghurt.', category: ItemCategory.tray, pricePence: 3600, servingsCount: 6, allergens: ['gluten','dairy'], tags: ['halal'] },
    { name: 'Mezze & Bread Box', description: 'Hummus, cacık, ezme, kısır with warm Turkish bread. Serves 8.', category: ItemCategory.bundle, pricePence: 2200, servingsCount: 8, allergens: ['sesame','gluten','dairy'], tags: ['halal','vegetarian'] },
  ]},
  { userEmail: 'tehran.sofreh@feastpot.co.uk', slug: 'tehran-sofreh-kensington', businessName: 'Tehran Sofreh', description: 'Persian khoresh, jewelled rices, and chelo kebabs from a Kensington kitchen. Family trays designed for the Persian sofreh.', cuisines: ['Persian','Iranian'], rating: 4.8, ratingCount: 16, collectionAddress: '28 Kensington High Street, London W8 4PF', postcodes: ['W8','W2','W11','SW7','SW5'], localRadiusMiles: 6, localFeePence: 600, minOrderPence: 3000, items: [
    { name: 'Chelo Kebab Koobideh (Full Tray)', description: 'Saffron rice with charcoal-grilled minced lamb skewers. Serves 8.', category: ItemCategory.tray, pricePence: 4400, servingsCount: 8, tags: ['halal'] },
    { name: 'Ghormeh Sabzi (Full Pot)', description: 'Slow-cooked herb stew with lamb, kidney beans and dried lime. Serves 6.', category: ItemCategory.soup, pricePence: 3400, servingsCount: 6, tags: ['halal'] },
    { name: 'Fesenjan (Full Pot)', description: 'Pomegranate-walnut chicken stew. Serves 6.', category: ItemCategory.soup, pricePence: 3800, servingsCount: 6, allergens: ['tree_nuts'], tags: ['halal'] },
    { name: 'Zereshk Polo (Full Tray)', description: 'Barberry rice with saffron chicken. Serves 8.', category: ItemCategory.tray, pricePence: 3600, servingsCount: 8, tags: ['halal'] },
    { name: 'Mast-o-Khiar & Sangak Bundle', description: 'Cucumber-mint yoghurt with warm sangak bread.', category: ItemCategory.bundle, pricePence: 1400, servingsCount: 8, allergens: ['gluten','dairy'], tags: ['halal','vegetarian'] },
  ]},
  { userEmail: 'manila.lutong@feastpot.co.uk', slug: 'manila-lutong-bahay-earls-court', businessName: 'Manila Lutong Bahay', description: 'Filipino home cooking - adobo, sinigang, lechon kawali, and pancit trays for parties. Delivered from Earls Court.', cuisines: ['Filipino'], rating: 4.7, ratingCount: 13, collectionAddress: '92 Earls Court Road, London SW5 9RA', postcodes: ['SW5','SW6','SW10','W14','W8'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Chicken Adobo (Full Pot)', description: 'Vinegar-and-soy braised chicken with bay leaves. Serves 8.', category: ItemCategory.soup, pricePence: 2800, servingsCount: 8, tags: [] },
    { name: 'Lechon Kawali (Full Tray)', description: 'Twice-cooked crispy pork belly with liver sauce. Serves 6.', category: ItemCategory.tray, pricePence: 3400, servingsCount: 6, tags: [] },
    { name: 'Pancit Palabok (Family Tray)', description: 'Rice noodles in shrimp sauce with chicharrón and egg. Serves 8.', category: ItemCategory.tray, pricePence: 2600, servingsCount: 8, allergens: ['crustaceans','egg'], tags: [] },
    { name: 'Sinigang na Baboy (Family Pot)', description: 'Sour tamarind soup with pork ribs and vegetables. Serves 6.', category: ItemCategory.soup, pricePence: 3000, servingsCount: 6, tags: [] },
    { name: 'Lumpiang Shanghai (40 pieces)', description: 'Crispy pork-and-veg spring rolls with sweet-chilli dip.', category: ItemCategory.snack, pricePence: 2000, servingsCount: 20, allergens: ['gluten'], tags: [] },
  ]},
  { userEmail: 'saigon.pho@feastpot.co.uk', slug: 'saigon-pho-bar-shoreditch', businessName: 'Saigon Pho Bar', description: 'Vietnamese pho, bun, and banh mi catering boxes from Shoreditch. 24-hour-broth pho served in vacuum pots that stay piping hot.', cuisines: ['Vietnamese'], rating: 4.8, ratingCount: 20, collectionAddress: '110 Kingsland Road, London E2 8DY', postcodes: ['E2','E1','E8','N1','EC2'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Pho Bo DIY Kit (Serves 8)', description: '24-hour-simmered beef pho broth, rice noodles, sliced beef, herbs.', category: ItemCategory.bundle, pricePence: 4200, servingsCount: 8, allergens: ['gluten'], tags: [] },
    { name: 'Bun Cha Hanoi (Family Tray)', description: 'Char-grilled pork patties with vermicelli, herbs and nuoc cham.', category: ItemCategory.tray, pricePence: 3400, servingsCount: 6, allergens: ['fish'], tags: [] },
    { name: 'Banh Mi Box (10 sandwiches)', description: 'Crusty baguettes with grilled pork, pâté, pickled veg, coriander.', category: ItemCategory.bundle, pricePence: 3500, servingsCount: 10, allergens: ['gluten','egg'], tags: [] },
    { name: 'Goi Cuon Fresh Rolls (24 pieces)', description: 'Rice-paper rolls with prawn, pork and herbs + peanut dip.', category: ItemCategory.snack, pricePence: 2400, servingsCount: 12, allergens: ['crustaceans','peanuts'], tags: [] },
    { name: 'Com Tam Suon (Full Tray)', description: 'Broken rice with grilled lemongrass pork chop. Serves 8.', category: ItemCategory.tray, pricePence: 3000, servingsCount: 8, tags: [] },
  ]},
  { userEmail: 'bangkok.kruakhao@feastpot.co.uk', slug: 'bangkok-krua-khao-camden', businessName: 'Bangkok Krua Khao', description: 'Thai street-food trays - pad krapow, green curry, som tam and khao soi from a Camden kitchen run by Bangkok-trained cooks.', cuisines: ['Thai'], rating: 4.7, ratingCount: 18, collectionAddress: '188 Camden High Street, London NW1 8QP', postcodes: ['NW1','NW3','NW5','N1','N7'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Green Curry Chicken (Full Pot)', description: 'Coconut green curry with chicken, aubergine and Thai basil. Serves 8.', category: ItemCategory.soup, pricePence: 3000, servingsCount: 8, tags: ['spice:2'] },
    { name: 'Pad Krapow Moo (Family Tray)', description: 'Stir-fried minced pork with holy basil and chilli. Serves 8.', category: ItemCategory.tray, pricePence: 2800, servingsCount: 8, tags: ['spice:3'] },
    { name: 'Khao Soi (Family Pot)', description: 'Northern Thai coconut-curry noodle soup with chicken thigh. Serves 6.', category: ItemCategory.soup, pricePence: 3200, servingsCount: 6, allergens: ['gluten'], tags: ['spice:2'] },
    { name: 'Som Tam Thai (Family Bowl)', description: 'Pounded green-papaya salad with peanuts and dried shrimp.', category: ItemCategory.snack, pricePence: 1600, servingsCount: 6, allergens: ['peanuts','crustaceans'], tags: ['spice:3'] },
    { name: 'Mango Sticky Rice (Family Tray)', description: 'Coconut sticky rice with sweet alphonso mango.', category: ItemCategory.snack, pricePence: 1800, servingsCount: 8, tags: ['vegan'] },
  ]},
  { userEmail: 'warsaw.pierogi@feastpot.co.uk', slug: 'warsaw-pierogi-bar-ealing', businessName: 'Warsaw Pierogi Bar', description: 'Polish home cooking - handmade pierogi, bigos and golabki from an Ealing kitchen. Family trays and frozen packs for the working week.', cuisines: ['Polish'], rating: 4.6, ratingCount: 10, collectionAddress: '52 The Broadway, Ealing, London W5 2NU', postcodes: ['W5','W3','W7','W13','UB1'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2000, items: [
    { name: 'Pierogi Ruskie (50 pieces)', description: 'Potato-and-cheese pierogi with caramelised onion butter.', category: ItemCategory.tray, pricePence: 2800, servingsCount: 10, allergens: ['gluten','dairy'], tags: ['vegetarian'] },
    { name: 'Pierogi z Mięsem (50 pieces)', description: 'Beef-and-pork pierogi pan-fried in butter.', category: ItemCategory.tray, pricePence: 3200, servingsCount: 10, allergens: ['gluten','dairy'], tags: [] },
    { name: 'Bigos (Family Pot)', description: "Hunter's stew with sauerkraut, pork, and Polish sausage. Serves 8.", category: ItemCategory.soup, pricePence: 2800, servingsCount: 8, tags: [] },
    { name: 'Golabki (12 cabbage rolls)', description: 'Cabbage rolls stuffed with rice and minced pork in tomato sauce.', category: ItemCategory.tray, pricePence: 3000, servingsCount: 6, tags: [] },
    { name: 'Żurek Frozen Pack (4 portions)', description: 'Sour rye soup with sausage and egg - reheat from frozen.', category: ItemCategory.frozen, pricePence: 1600, servingsCount: 4, allergens: ['gluten','egg'], tags: [] },
  ]},
  { userEmail: 'rio.feijoada@feastpot.co.uk', slug: 'rio-feijoada-stockwell', businessName: 'Rio Feijoada', description: 'Brazilian feijoada Saturdays, picanha trays, and pão de queijo boxes from a Stockwell kitchen. Catering for the South London Brazilian community.', cuisines: ['Brazilian'], rating: 4.7, ratingCount: 14, collectionAddress: '24 Stockwell Road, London SW9 9DL', postcodes: ['SW9','SW8','SW2','SW4','SE11'], localRadiusMiles: 6, localFeePence: 500, minOrderPence: 2500, items: [
    { name: 'Feijoada Completa (Family Pot)', description: 'Black-bean stew with pork ribs, smoked sausage and bacon. Serves 8.', category: ItemCategory.soup, pricePence: 3800, servingsCount: 8, tags: [] },
    { name: 'Picanha Tray (Serves 8)', description: 'Wood-fire-grilled rump cap with farofa and vinaigrette.', category: ItemCategory.tray, pricePence: 4800, servingsCount: 8, tags: [] },
    { name: 'Pão de Queijo (40 pieces)', description: 'Cheesy tapioca-flour bread balls - addictive when warm.', category: ItemCategory.snack, pricePence: 2000, servingsCount: 20, allergens: ['dairy'], tags: ['vegetarian'] },
    { name: 'Moqueca (Family Pot)', description: 'Coconut-and-palm-oil fish stew from Bahia. Serves 6.', category: ItemCategory.soup, pricePence: 3600, servingsCount: 6, allergens: ['fish'], tags: [] },
    { name: 'Coxinha (30 pieces)', description: 'Teardrop-shaped chicken croquettes with catupiry cheese.', category: ItemCategory.snack, pricePence: 2200, servingsCount: 15, allergens: ['gluten','dairy'], tags: [] },
  ]},
  { userEmail: 'marrakech.tagine@feastpot.co.uk', slug: 'marrakech-tagine-house-notting-hill', businessName: 'Marrakech Tagine House', description: 'Moroccan tagines, couscous royale and pastilla - slow-cooked in clay pots from a Notting Hill kitchen. Catering for weekends and weddings.', cuisines: ['Moroccan'], rating: 4.8, ratingCount: 17, collectionAddress: '40 Portobello Road, London W11 3DB', postcodes: ['W11','W2','W10','NW1','NW10'], localRadiusMiles: 6, localFeePence: 600, minOrderPence: 3000, items: [
    { name: 'Lamb Tagine with Prunes (Family Pot)', description: 'Slow-cooked lamb shoulder with prunes, almonds and saffron. Serves 6.', category: ItemCategory.soup, pricePence: 4200, servingsCount: 6, allergens: ['tree_nuts'], tags: ['halal'] },
    { name: 'Chicken Tagine with Olives & Lemon (Family Pot)', description: 'Bone-in chicken with preserved lemon and Kalamata olives. Serves 6.', category: ItemCategory.soup, pricePence: 3400, servingsCount: 6, tags: ['halal'] },
    { name: 'Couscous Royale (Full Tray)', description: 'Steamed couscous with seven vegetables, lamb, chicken and merguez. Serves 10.', category: ItemCategory.tray, pricePence: 4400, servingsCount: 10, allergens: ['gluten'], tags: ['halal'] },
    { name: 'Chicken Pastilla (Family Pie)', description: 'Sweet-and-savoury filo pie with chicken, almonds and cinnamon. Serves 8.', category: ItemCategory.tray, pricePence: 3600, servingsCount: 8, allergens: ['gluten','tree_nuts','egg'], tags: ['halal'] },
    { name: 'Harira (Family Pot)', description: 'Tomato-lentil-chickpea soup, perfect for iftar. Serves 8.', category: ItemCategory.soup, pricePence: 2200, servingsCount: 8, allergens: ['gluten'], tags: ['halal','vegan'] },
  ]},
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PROD !== '1') {
    throw new Error(
      '[seed-vendors] refusing to run: NODE_ENV=production. This script mutates vendor + menu rows wholesale and must never run against a live database. Set ALLOW_SEED_IN_PROD=1 to override (not recommended).',
    );
  }
  console.info('[seed-vendors] starting…');

  // Kwame's items (the previous full seed died right before these).
  const kwame = await prisma.vendor.findUnique({ where: { slug: 'kwames-jollof-brixton' } });
  if (kwame) {
    let kwameMenu = await prisma.menu.findFirst({ where: { vendorId: kwame.id, name: 'Main Menu' } });
    if (!kwameMenu) {
      kwameMenu = await prisma.menu.create({ data: { vendorId: kwame.id, name: 'Main Menu', isActive: true, sortOrder: 0 } });
    }
    // Wipe + recreate Kwame's items so this script converges to the same end
    // state as the full seed.ts every run (not only when the table is empty).
    await prisma.menuItem.deleteMany({ where: { vendorId: kwame.id } });
    await prisma.menuItem.create({ data: { isAvailable: true, vendorId: kwame.id, menuId: kwameMenu.id, name: 'Ghana Jollof (Full Tray)', description: 'Long-grain jollof with shito on the side. Serves 10.', category: ItemCategory.tray, pricePence: 3000, servingsCount: 10, allergens: [], tags: ['halal'] } });
    await prisma.menuItem.create({ data: { isAvailable: true, vendorId: kwame.id, menuId: kwameMenu.id, name: 'Waakye (Full Tray)', description: 'Rice-and-beans with shito, gari & boiled egg. Serves 10.', category: ItemCategory.tray, pricePence: 2800, servingsCount: 10, allergens: ['egg'], tags: ['halal'] } });
    console.info('[seed-vendors] kwame items refreshed');
    await prisma.deliveryConfig.upsert({
      where: { vendorId: kwame.id },
      update: {},
      create: { vendorId: kwame.id, types: [DeliveryType.local, DeliveryType.collection], localRadiusMiles: 5, localFeePence: 400, minOrderPence: 2000, collectionAddress: '12 Atlantic Road, Brixton, London SW9 8HX', postcodes: ['SW9','SW2','SE5','SW8'] },
    });
  }

  // Maman delivery config (also possibly missing if first run died early)
  const maman = await prisma.vendor.findUnique({ where: { slug: 'mamans-kitchen-peckham' } });
  if (maman) {
    await prisma.deliveryConfig.upsert({
      where: { vendorId: maman.id },
      update: {},
      create: { vendorId: maman.id, types: [DeliveryType.local, DeliveryType.collection], localRadiusMiles: 8, localFeePence: 500, minOrderPence: 2500, freeDeliveryOverPence: 7500, collectionAddress: '45 Rye Lane, Peckham, London SE15 4ST', postcodes: ['SE15','SE5','SE22','SE24','SW2','SW9'] },
    });
  }

  let total = 0;
  let totalItems = 0;
  for (const spec of EXTRA_VENDORS) {
    const owner = await prisma.user.findUnique({ where: { email: spec.userEmail }, select: { id: true } });
    if (!owner) {
      console.warn(`[seed-vendors] SKIP ${spec.slug}: owner ${spec.userEmail} not in users table`);
      continue;
    }
    const vendor = await prisma.vendor.upsert({
      where: { slug: spec.slug },
      update: { businessName: spec.businessName, description: spec.description, cuisines: spec.cuisines, rating: spec.rating, ratingCount: spec.ratingCount },
      create: {
        userId: owner.id,
        businessName: spec.businessName,
        slug: spec.slug,
        description: spec.description,
        cuisines: spec.cuisines,
        status: VendorStatus.live,
        rating: spec.rating,
        ratingCount: spec.ratingCount,
        commissionBps: 1200,
        payoutsEnabled: true,
        approvedAt: new Date('2026-03-01T10:00:00Z'),
      },
    });
    let menu = await prisma.menu.findFirst({ where: { vendorId: vendor.id, name: 'Main Menu' } });
    if (!menu) {
      menu = await prisma.menu.create({ data: { vendorId: vendor.id, name: 'Main Menu', isActive: true, sortOrder: 0 } });
    }
    await prisma.menuItem.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.$transaction(
      spec.items.map((it) =>
        prisma.menuItem.create({
          data: { isAvailable: true,
            vendorId: vendor.id,
            menuId: menu!.id,
            name: it.name,
            description: it.description,
            category: it.category,
            pricePence: it.pricePence,
            servingsCount: it.servingsCount,
            allergens: it.allergens ?? [],
            tags: it.tags ?? [],
            moderationStatus: ModerationStatus.auto_approved,
          },
        }),
      ),
    );
    await prisma.deliveryConfig.upsert({
      where: { vendorId: vendor.id },
      update: { types: [DeliveryType.local, DeliveryType.collection], localRadiusMiles: spec.localRadiusMiles, localFeePence: spec.localFeePence, minOrderPence: spec.minOrderPence, collectionAddress: spec.collectionAddress, postcodes: spec.postcodes },
      create: { vendorId: vendor.id, types: [DeliveryType.local, DeliveryType.collection], localRadiusMiles: spec.localRadiusMiles, localFeePence: spec.localFeePence, minOrderPence: spec.minOrderPence, collectionAddress: spec.collectionAddress, postcodes: spec.postcodes },
    });
    total++;
    totalItems += spec.items.length;
    console.info(`[seed-vendors] ${spec.slug} (${spec.items.length} items)`);
  }

  const liveCount = await prisma.vendor.count({ where: { status: VendorStatus.live } });
  console.info(`[seed-vendors] done. ${total} new vendors, ${totalItems} new items. Total live vendors: ${liveCount}`);
}

main().catch((e) => { console.error('[seed-vendors] failed:', e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
