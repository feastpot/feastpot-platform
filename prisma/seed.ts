/**
 * Feastpot seed
 *
 * Creates 8 users (via Supabase Auth Admin → public.users), 2 vendors, menus,
 * 12 menu items, delivery config, 5 orders, 3 reviews. Idempotent: safe to
 * re-run; existing rows are upserted by deterministic keys (email / slug).
 *
 * NOTE on field mapping vs the original brief:
 *   The schema uses `cuisines` (not `cuisineTypes`), `commissionBps` (Int basis
 *   points, not percent), `rating` (not `avgRating`), and has no `fsaRating`,
 *   `address`, `halal`, `vegan`, `spiceLevel`, `availableDays`, `leadTimeHours`
 *   columns. Halal/vegan/spice/serves are encoded into `MenuItem.tags` and the
 *   `servingsCount` field. Vendor address is captured per-customer in the
 *   Address table only. Reviews use `rating`/`isHidden` instead of
 *   `vendorRating`/`moderationStatus`.
 */

import {
  DeliveryType,
  ItemCategory,
  ModerationStatus,
  OrderStatus,
  OrderType,
  PaymentStatus,
  PaymentType,
  PrismaClient,
  UserRole,
  VendorStatus,
} from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

interface SeedUser {
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  password: string;
}

const USERS: SeedUser[] = [
  { email: 'soul@feastpot.co.uk', role: UserRole.admin, firstName: 'Soul', lastName: 'Admin', password: 'Feastpot!Admin1' },
  { email: 'support@feastpot.co.uk', role: UserRole.support, firstName: 'Sara', lastName: 'Support', password: 'Feastpot!Support1' },
  { email: 'finance@feastpot.co.uk', role: UserRole.finance, firstName: 'Felix', lastName: 'Finance', password: 'Feastpot!Finance1' },
  { email: 'compliance@feastpot.co.uk', role: UserRole.compliance, firstName: 'Cara', lastName: 'Compliance', password: 'Feastpot!Comp1' },
  { email: 'maman@feastpot.co.uk', role: UserRole.vendor, firstName: 'Adunni', lastName: "Maman", password: 'Feastpot!Vendor1' },
  { email: 'chef.kwame@feastpot.co.uk', role: UserRole.vendor, firstName: 'Kwame', lastName: 'Asante', password: 'Feastpot!Vendor2' },
  { email: 'grace@example.com', role: UserRole.customer, firstName: 'Grace', lastName: 'Okafor', password: 'Feastpot!Cust1' },
  { email: 'david@example.com', role: UserRole.customer, firstName: 'David', lastName: 'Campbell', password: 'Feastpot!Cust2' },
];

function getSupabaseAdmin(): SupabaseClient {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to seed users');
  }
  const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureAuthUser(
  admin: SupabaseClient,
  user: SeedUser,
): Promise<string> {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === user.email.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { role: user.role, provider: 'email' },
      user_metadata: { first_name: user.firstName, last_name: user.lastName },
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    app_metadata: { role: user.role, provider: 'email' },
    user_metadata: { first_name: user.firstName, last_name: user.lastName },
  });
  if (error || !data.user) throw error ?? new Error(`createUser failed for ${user.email}`);
  return data.user.id;
}

async function upsertPublicUser(id: string, u: SeedUser) {
  return prisma.user.upsert({
    where: { email: u.email },
    update: { role: u.role, firstName: u.firstName, lastName: u.lastName, emailVerified: true },
    create: {
      id,
      email: u.email,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      emailVerified: true,
    },
  });
}

async function main() {
  console.info('[seed] starting…');

  // 1. Auth users + public.users
  const admin = getSupabaseAdmin();
  const userMap = new Map<string, string>(); // email → id
  for (const u of USERS) {
    const id = await ensureAuthUser(admin, u);
    const row = await upsertPublicUser(id, u);
    userMap.set(u.email, row.id);
    console.info(`[seed] user ${u.email} (${u.role}) → ${row.id}`);
  }

  // 2. Vendors
  const mamanUserId = userMap.get('maman@feastpot.co.uk')!;
  const kwameUserId = userMap.get('chef.kwame@feastpot.co.uk')!;

  const maman = await prisma.vendor.upsert({
    where: { slug: 'mamans-kitchen-peckham' },
    update: {},
    create: {
      userId: mamanUserId,
      businessName: "Maman's Kitchen",
      slug: 'mamans-kitchen-peckham',
      description: 'Authentic Nigerian and Caribbean home cooking from Peckham. Family recipes, party trays, and frozen packs for the week.',
      cuisines: ['Nigerian', 'Ghanaian', 'Caribbean'],
      status: VendorStatus.live,
      rating: 4.8,
      ratingCount: 24,
      commissionBps: 1200,
      payoutsEnabled: true,
      approvedAt: new Date('2025-01-15T10:00:00Z'),
    },
  });

  const kwame = await prisma.vendor.upsert({
    where: { slug: 'kwames-jollof-brixton' },
    update: {},
    create: {
      userId: kwameUserId,
      businessName: "Kwame's Jollof",
      slug: 'kwames-jollof-brixton',
      description: 'Ghanaian jollof, waakye, and grilled tilapia from a Brixton kitchen. Specialising in office lunches and family parties.',
      cuisines: ['Ghanaian'],
      status: VendorStatus.live,
      rating: 4.5,
      ratingCount: 11,
      commissionBps: 1200,
      payoutsEnabled: true,
      approvedAt: new Date('2025-02-01T10:00:00Z'),
    },
  });
  console.info(`[seed] vendors: ${maman.slug}, ${kwame.slug}`);

  // 3. Menus for Maman's Kitchen
  const mainMenu = await prisma.menu.upsert({
    where: { id: (await prisma.menu.findFirst({ where: { vendorId: maman.id, name: 'Main Menu' } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
    update: { isActive: true, sortOrder: 0 },
    create: { vendorId: maman.id, name: 'Main Menu', isActive: true, sortOrder: 0 },
  });
  const frozenMenu = await prisma.menu.upsert({
    where: { id: (await prisma.menu.findFirst({ where: { vendorId: maman.id, name: 'Frozen Packs' } }))?.id ?? '00000000-0000-0000-0000-000000000001' },
    update: { isActive: true, sortOrder: 1 },
    create: { vendorId: maman.id, name: 'Frozen Packs', isActive: true, sortOrder: 1 },
  });

  // 4. Menu items (12) — replace-then-create for idempotency
  await prisma.menuItem.deleteMany({ where: { vendorId: maman.id } });
  const items = await prisma.$transaction([
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Egusi Soup (Full Pot)', description: 'Slow-cooked egusi with goat meat, smoked fish & spinach. Serves 6–8.', category: ItemCategory.soup, pricePence: 3200, servingsCount: 7, allergens: ['tree_nuts', 'sesame'], tags: ['halal'], moderationStatus: ModerationStatus.auto_approved } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Jollof Rice (Full Tray)', description: 'Smoky party jollof with chicken stock base. Serves 10–12.', category: ItemCategory.tray, pricePence: 2800, servingsCount: 11, allergens: [], tags: ['halal'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Pounded Yam (6 portions)', description: 'Hand-pounded yam, vacuum-sealed.', category: ItemCategory.swallow, pricePence: 1800, servingsCount: 6, allergens: [], tags: ['halal'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Pepper Soup (Full Pot)', description: 'Catfish pepper soup with calabash nutmeg. Serves 8.', category: ItemCategory.soup, pricePence: 3500, servingsCount: 8, allergens: ['fish'], tags: ['halal', 'spice:2'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Suya Skewers (20 sticks)', description: 'Beef suya with ground peanut yaji.', category: ItemCategory.protein, pricePence: 2200, servingsCount: 10, allergens: ['peanuts'], tags: ['halal', 'spice:2'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Fried Plantain (Large)', description: 'Sweet ripe plantain, fried in vegetable oil.', category: ItemCategory.snack, pricePence: 800, servingsCount: 4, allergens: [], tags: ['halal', 'vegan'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Small Chops Party Pack (100pcs)', description: 'Puff-puff, samosa, spring roll, peppered chicken.', category: ItemCategory.bundle, pricePence: 5500, servingsCount: 20, allergens: ['gluten', 'egg'], tags: ['halal'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: frozenMenu.id, name: 'Egusi Soup Frozen Pack (2 portions)', description: 'Reheat-from-frozen egusi, vacuum sealed.', category: ItemCategory.frozen, pricePence: 1400, servingsCount: 2, allergens: ['tree_nuts', 'sesame'], tags: ['halal'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Jerk Chicken (Full Tray)', description: 'Marinated 24h, grilled over pimento wood. Serves 10.', category: ItemCategory.tray, pricePence: 3800, servingsCount: 10, allergens: [], tags: ['spice:2'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Rice and Peas (Full Tray)', description: 'Coconut rice with red kidney beans. Serves 10.', category: ItemCategory.tray, pricePence: 2400, servingsCount: 10, allergens: [], tags: ['vegan'] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Oxtail Stew (Full Pot)', description: 'Slow-braised oxtail with butter beans. Serves 6–8.', category: ItemCategory.soup, pricePence: 4500, servingsCount: 7, allergens: [], tags: [] } }),
    prisma.menuItem.create({ data: { vendorId: maman.id, menuId: mainMenu.id, name: 'Festival Bread (24 pieces)', description: 'Sweet fried dough — perfect with jerk chicken.', category: ItemCategory.snack, pricePence: 1600, servingsCount: 12, allergens: ['gluten'], tags: ['vegan'] } }),
  ]);
  console.info(`[seed] menu items: ${items.length}`);

  // A couple of items for Kwame too so vendor 2 isn't empty
  const kwameMenu = await prisma.menu.upsert({
    where: { id: (await prisma.menu.findFirst({ where: { vendorId: kwame.id } }))?.id ?? '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: { vendorId: kwame.id, name: 'Main Menu', isActive: true, sortOrder: 0 },
  });
  await prisma.menuItem.deleteMany({ where: { vendorId: kwame.id } });
  const kwameJollof = await prisma.menuItem.create({
    data: { vendorId: kwame.id, menuId: kwameMenu.id, name: 'Ghana Jollof (Full Tray)', description: 'Long-grain jollof with shito on the side. Serves 10.', category: ItemCategory.tray, pricePence: 3000, servingsCount: 10, allergens: [], tags: ['halal'] },
  });
  await prisma.menuItem.create({
    data: { vendorId: kwame.id, menuId: kwameMenu.id, name: 'Waakye (Full Tray)', description: 'Rice-and-beans with shito, gari & boiled egg. Serves 10.', category: ItemCategory.tray, pricePence: 2800, servingsCount: 10, allergens: ['egg'], tags: ['halal'] },
  });

  // 5. Delivery config (Maman: local 8mi, Kwame: local 5mi)
  await prisma.deliveryConfig.upsert({
    where: { vendorId: maman.id },
    update: {},
    create: {
      vendorId: maman.id,
      types: [DeliveryType.local, DeliveryType.collection],
      localRadiusMiles: 8,
      localFeePence: 500,
      minOrderPence: 2500,
      freeDeliveryOverPence: 7500,
      collectionAddress: '45 Rye Lane, Peckham, London SE15 4ST',
      postcodes: ['SE15', 'SE5', 'SE22', 'SE24', 'SW2', 'SW9'],
    },
  });
  await prisma.deliveryConfig.upsert({
    where: { vendorId: kwame.id },
    update: {},
    create: {
      vendorId: kwame.id,
      types: [DeliveryType.local, DeliveryType.collection],
      localRadiusMiles: 5,
      localFeePence: 400,
      minOrderPence: 2000,
      collectionAddress: '12 Atlantic Road, Brixton, London SW9 8HX',
      postcodes: ['SW9', 'SW2', 'SE5', 'SW8'],
    },
  });

  // 6. Customer addresses
  const graceId = userMap.get('grace@example.com')!;
  const davidId = userMap.get('david@example.com')!;
  const graceAddr = await prisma.address.upsert({
    where: { id: (await prisma.address.findFirst({ where: { userId: graceId } }))?.id ?? '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: { userId: graceId, label: 'Home', line1: '22 Bellenden Road', city: 'London', postcode: 'SE15 4QY', isDefault: true },
  });
  const davidAddr = await prisma.address.upsert({
    where: { id: (await prisma.address.findFirst({ where: { userId: davidId } }))?.id ?? '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: { userId: davidId, label: 'Home', line1: '8 Coldharbour Lane', city: 'London', postcode: 'SW9 8LF', isDefault: true },
  });

  // 7. Orders — wipe & recreate for idempotency
  await prisma.payment.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});

  const itemBy = (name: string) => items.find((i) => i.name === name)!;
  const egusi = itemBy('Egusi Soup (Full Pot)');
  const jollof = itemBy('Jollof Rice (Full Tray)');
  const jerk = itemBy('Jerk Chicken (Full Tray)');
  const smallChops = itemBy('Small Chops Party Pack (100pcs)');
  const frozenEgusi = itemBy('Egusi Soup Frozen Pack (2 portions)');

  function commission(subtotalPence: number, bps: number) {
    return Math.round((subtotalPence * bps) / 10000);
  }

  // Order 1: Grace → Maman, delivered, egusi + jollof, total £65
  const o1 = await prisma.order.create({
    data: {
      orderNumber: 'FP-1001',
      customerId: graceId,
      vendorId: maman.id,
      addressId: graceAddr.id,
      type: OrderType.standard,
      status: OrderStatus.delivered,
      deliveryType: DeliveryType.local,
      subtotalPence: 6000,
      deliveryFeePence: 500,
      totalPence: 6500,
      commissionPence: commission(6000, maman.commissionBps),
      vendorPayoutPence: 6000 - commission(6000, maman.commissionBps),
      acceptedAt: new Date('2026-04-25T11:00:00Z'),
      dispatchedAt: new Date('2026-04-26T13:00:00Z'),
      deliveredAt: new Date('2026-04-26T15:30:00Z'),
      items: {
        create: [
          { menuItemId: egusi.id, nameSnapshot: egusi.name, quantity: 1, unitPence: egusi.pricePence, totalPence: egusi.pricePence },
          { menuItemId: jollof.id, nameSnapshot: jollof.name, quantity: 1, unitPence: jollof.pricePence, totalPence: jollof.pricePence },
        ],
      },
      payments: {
        create: { userId: graceId, type: PaymentType.capture, status: PaymentStatus.succeeded, amountPence: 6500, processedAt: new Date('2026-04-25T10:55:00Z') },
      },
    },
  });

  // Order 2: Grace → Maman, accepted, jerk tray, total £43
  await prisma.order.create({
    data: {
      orderNumber: 'FP-1002',
      customerId: graceId,
      vendorId: maman.id,
      addressId: graceAddr.id,
      status: OrderStatus.accepted,
      deliveryType: DeliveryType.local,
      subtotalPence: 3800,
      deliveryFeePence: 500,
      totalPence: 4300,
      commissionPence: commission(3800, maman.commissionBps),
      vendorPayoutPence: 3800 - commission(3800, maman.commissionBps),
      acceptedAt: new Date('2026-05-08T12:00:00Z'),
      items: { create: [{ menuItemId: jerk.id, nameSnapshot: jerk.name, quantity: 1, unitPence: jerk.pricePence, totalPence: jerk.pricePence }] },
      payments: { create: { userId: graceId, type: PaymentType.capture, status: PaymentStatus.succeeded, amountPence: 4300, processedAt: new Date('2026-05-08T11:55:00Z') } },
    },
  });

  // Order 3: David → Maman, pending, small chops, total £60
  await prisma.order.create({
    data: {
      orderNumber: 'FP-1003',
      customerId: davidId,
      vendorId: maman.id,
      addressId: davidAddr.id,
      status: OrderStatus.pending,
      deliveryType: DeliveryType.local,
      subtotalPence: 5500,
      deliveryFeePence: 500,
      totalPence: 6000,
      commissionPence: commission(5500, maman.commissionBps),
      vendorPayoutPence: 5500 - commission(5500, maman.commissionBps),
      items: { create: [{ menuItemId: smallChops.id, nameSnapshot: smallChops.name, quantity: 1, unitPence: smallChops.pricePence, totalPence: smallChops.pricePence }] },
      payments: { create: { userId: davidId, type: PaymentType.capture, status: PaymentStatus.pending, amountPence: 6000 } },
    },
  });

  // Order 4: David → Kwame, cancelled, jollof, total £33
  await prisma.order.create({
    data: {
      orderNumber: 'FP-1004',
      customerId: davidId,
      vendorId: kwame.id,
      addressId: davidAddr.id,
      status: OrderStatus.cancelled,
      deliveryType: DeliveryType.local,
      subtotalPence: 3000,
      deliveryFeePence: 400,
      totalPence: 3400,
      commissionPence: 0,
      vendorPayoutPence: 0,
      cancelledAt: new Date('2026-05-02T09:30:00Z'),
      notes: 'Customer cancelled within free window',
      items: { create: [{ menuItemId: kwameJollof.id, nameSnapshot: kwameJollof.name, quantity: 1, unitPence: kwameJollof.pricePence, totalPence: kwameJollof.pricePence }] },
    },
  });

  // Order 5: Grace → Maman, delivered, frozen pack ×2, total £34
  const o5 = await prisma.order.create({
    data: {
      orderNumber: 'FP-1005',
      customerId: graceId,
      vendorId: maman.id,
      addressId: graceAddr.id,
      status: OrderStatus.delivered,
      deliveryType: DeliveryType.local,
      subtotalPence: 2800,
      deliveryFeePence: 500,
      totalPence: 3300,
      commissionPence: commission(2800, maman.commissionBps),
      vendorPayoutPence: 2800 - commission(2800, maman.commissionBps),
      acceptedAt: new Date('2026-04-18T11:00:00Z'),
      deliveredAt: new Date('2026-04-19T14:00:00Z'),
      items: { create: [{ menuItemId: frozenEgusi.id, nameSnapshot: frozenEgusi.name, quantity: 2, unitPence: frozenEgusi.pricePence, totalPence: frozenEgusi.pricePence * 2 }] },
      payments: { create: { userId: graceId, type: PaymentType.capture, status: PaymentStatus.succeeded, amountPence: 3300, processedAt: new Date('2026-04-18T10:55:00Z') } },
    },
  });

  // 8. Reviews (Grace ×2 visible, David ×1 hidden ≈ "held for moderation")
  await prisma.review.create({
    data: { orderId: o1.id, vendorId: maman.id, customerId: graceId, rating: 5, body: 'Absolutely incredible! The egusi tasted exactly like my mum makes it. Will be ordering every week!', isVerified: true, isHidden: false },
  });
  await prisma.review.create({
    data: { orderId: o5.id, vendorId: maman.id, customerId: graceId, rating: 5, body: 'Frozen packs are a lifesaver during the week. Reheats perfectly.', isVerified: true, isHidden: false },
  });
  // David's review attached to his cancelled Kwame order — flagged as hidden pending moderation
  const davidOrder = await prisma.order.findFirst({ where: { customerId: davidId, vendorId: kwame.id } });
  if (davidOrder) {
    await prisma.review.create({
      data: { orderId: davidOrder.id, vendorId: kwame.id, customerId: davidId, rating: 3, body: 'Good food but delivery was late', isVerified: false, isHidden: true },
    });
  }

  console.info('[seed] done.');
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
