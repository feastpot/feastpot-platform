// One explicitly marked demo, never the broad seed or test-persona writer.
// Default: read-only preview. Apply only with --apply --confirm-production.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const { PLATFORM_FACTS } = require('@feastpot/config/platform-facts');
const commissionBps = PLATFORM_FACTS.commission.marketplaceFirst * 100;
if (!Number.isInteger(commissionBps)) throw new Error('Configured commission rate is invalid.');
const slug = 'demo-lagos-table';
const provenance = 'nigerian-demo-vendor';
const apply = process.argv.includes('--apply');
if (apply && !process.argv.includes('--confirm-production')) {
  throw new Error('Production writes require --apply --confirm-production.');
}
if (!process.env.PROD_DIRECT_URL) throw new Error('PROD_DIRECT_URL is required.');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.PROD_DIRECT_URL } },
  log: [],
});
let stage = 'checking the production database';
const photoFiles = {
  feast: 'attached_assets/generated_images/nigerian-demo-feast.jpg',
  jollof: 'attached_assets/generated_images/nigerian-demo-jollof.jpg',
  egusi: 'attached_assets/generated_images/nigerian-demo-egusi.jpg',
  plantain: 'attached_assets/generated_images/nigerian-demo-plantain.jpg',
};

async function seed() {
  const existing = await prisma.vendor.findUnique({
    where: { slug },
    include: { user: true, menuItems: true },
  });
  if (existing) {
    if (!existing.user.isTestData || existing.user.provenance !== provenance) {
      throw new Error('Slug belongs to a non-demo record; refusing to alter it.');
    }
    console.log(JSON.stringify({ alreadyExists: true, vendorId: existing.id, slug }));
    return;
  }
  if (!apply) {
    console.log(JSON.stringify({ preview: true, slug, status: 'pending', dishes: 4, photos: 4 }));
    return;
  }

  const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const storageKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!storageUrl || !storageKey) throw new Error('Existing media storage is not configured.');
  const storage = createClient(storageUrl, storageKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from('feastpot-media');
  const photos = {};
  for (const [name, file] of Object.entries(photoFiles)) {
    stage = `uploading demo photo: ${name}`;
    const path = `demo-vendors/${slug}/${name}.jpg`;
    const { error } = await storage.upload(path, await readFile(file), {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    });
    if (error) throw new Error(`Demo photo upload failed (${name}).`);
    photos[name] = storage.getPublicUrl(path).data.publicUrl;
    stage = `checking public demo photo: ${name}`;
    const response = await fetch(photos[name], { signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
      throw new Error(`Demo photo is not publicly accessible (${name}).`);
    }
    await response.body?.cancel();
  }

  stage = 'creating the production demo records';
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${provenance}))`;
      if (await tx.vendor.findUnique({ where: { slug } })) {
        throw new Error('Demo appeared concurrently; rerun to inspect the existing record.');
      }
      stage = 'creating the labelled demo owner';
      const owner = await tx.user.create({
        data: {
          email: 'demo-lagos-table@example.invalid',
          phone: '+447700900321',
          firstName: 'Demo',
          lastName: 'Lagos Table',
          role: 'vendor',
          status: 'suspended',
          isTestData: true,
          provenance,
          avatarUrl: photos.feast,
          emailVerified: false,
          phoneVerified: false,
        },
      });
      stage = 'creating the pending demo vendor';
      const vendor = await tx.vendor.create({
        data: {
          userId: owner.id,
          businessName: 'Lagos Table (DEMO)',
          slug,
          description:
            'DEMO ONLY: a fictional Nigerian catering kitchen serving jollof rice, egusi and plantain. Not a real business and not accepting orders. Photos are AI-generated illustrations.',
          cuisines: ['Nigerian'],
          status: 'pending',
          isSeedData: false,
          logoUrl: photos.jollof,
          coverImageUrl: photos.feast,
          specialities: ['Smoky jollof rice', 'Egusi soup', 'Party trays', 'Fried plantain'],
          vendorStory:
            'This fictional Lagos-inspired London kitchen demonstrates family-style Nigerian catering for celebrations and shared meals. All names, recipes, prices, schedules and address details are sample data. It has no verified food registration, insurance, tax profile or payment account. The profile must remain private and non-orderable.',
          socialLinks: { web: 'https://example.com/demo-lagos-table' },
          commissionBps,
          openingDays: [2, 3, 4, 5, 6, 0],
          slotOpenHour: 10,
          slotCloseHour: 20,
          prepLeadHours: 48,
          maxOrdersPerDay: 8,
          maxTraysPerDay: 20,
          sameDayOrders: false,
          largeOrderLeadHours: 72,
          largeOrderTrayThreshold: 6,
          eventCateringManualQuote: true,
          foundingAllowanceGrantedPence: 0,
          foundingAllowanceUsedPence: 0,
        },
      });
      stage = 'creating the demo menu';
      const menu = await tx.menu.create({
        data: { vendorId: vendor.id, name: 'Nigerian Classics (Demo)', isActive: false },
      });
      const dishes = [
        {
          name: 'Smoky Jollof Rice & Chicken Tray',
          category: 'tray',
          pricePence: 4500,
          servingsCount: 6,
          photo: 'jollof',
          description: 'Demo recipe: tomato jollof rice, grilled chicken and fried plantain.',
        },
        {
          name: 'Egusi Soup & Pounded Yam',
          category: 'soup',
          pricePence: 5500,
          servingsCount: 6,
          photo: 'egusi',
          description:
            'Demo recipe: melon-seed and leafy-green soup with beef, served with pounded yam.',
        },
        {
          name: 'Golden Fried Plantain',
          category: 'side',
          pricePence: 1800,
          servingsCount: 6,
          photo: 'plantain',
          description: 'Demo recipe: ripe plantain slices fried until golden.',
        },
        {
          name: 'Lagos Celebration Feast',
          category: 'tray',
          pricePence: 9500,
          servingsCount: 10,
          photo: 'feast',
          description:
            'Demo catering selection: jollof rice, grilled chicken, egusi, pounded yam and plantain.',
        },
      ];
      const itemIds = [];
      for (const [sortOrder, dish] of dishes.entries()) {
        stage = `creating demo dish: ${dish.name}`;
        const { photo, ...data } = dish;
        const item = await tx.menuItem.create({
          data: {
            ...data,
            vendorId: vendor.id,
            menuId: menu.id,
            description: `${data.description} Illustrative only; allergens have not been declared by a real vendor.`,
            imageUrls: [photos[photo]],
            allergens: [],
            allergensFreeFrom: false,
            tags: ['Nigerian', 'Demo'],
            preparationHours: 48,
            stockCount: 20,
            sortOrder,
            isAvailable: false,
            moderationStatus: 'held',
            decisionReason:
              'Demo only: not submitted, no verified allergen declaration, not for sale.',
          },
        });
        itemIds.push(item.id);
      }
      stage = 'setting featured dishes and delivery configuration';
      await tx.vendor.update({
        where: { id: vendor.id },
        data: { featuredDishes: itemIds.slice(0, 3) },
      });
      await tx.deliveryConfig.create({
        data: {
          vendorId: vendor.id,
          types: ['local', 'collection'],
          localRadiusMiles: 5,
          localFeePence: 499,
          nationwideEnabled: false,
          nationwideFeePence: 0,
          minOrderPence: 2500,
          freeDeliveryOverPence: 8000,
          postcodes: ['SE15', 'SE5', 'SE14', 'SE22'],
          kitchenPostcode: 'SE15 4ST',
          collectionAddress: 'DEMO ONLY - not a real collection point, Peckham, London, SE15 4ST',
          collectionLine1: 'DEMO kitchen - not a real collection point',
          collectionLine2: 'Illustrative address only',
          collectionTown: 'London',
          collectionPostcode: 'SE15 4ST',
          latitude: 51.4699,
          longitude: -0.0677,
        },
      });
      stage = 'recording the demo audit entry';
      await tx.auditLog.create({
        data: {
          action: 'demo_vendor_seeded',
          entityType: 'Vendor',
          entityId: vendor.id,
          isTestData: true,
          provenance,
          metadata: {
            requestedBy: 'workspace-user',
            demo: true,
            public: false,
            menuItems: 4,
            photos: 4,
            mediaStorage: 'development-public-demo-assets',
          },
        },
      });
      return {
        vendorId: vendor.id,
        slug,
        businessName: vendor.businessName,
        status: vendor.status,
        menuItems: 4,
        photos: 4,
      };
    },
    { maxWait: 10000, timeout: 30000 },
  );
  console.log(JSON.stringify(result));
}

try {
  await seed();
} catch (error) {
  // Do not emit third-party errors that might contain credentials or URLs.
  const code = /^P\d{4}$/.test(error?.code ?? '') ? ` (${error.code})` : '';
  console.error(
    `Demo seed failed while ${stage}${code}. No vendor transaction is partially committed.`,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
