import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { PrismaClient, UserRole } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

export const proofDirectory = '.local/fx03-production-proof';
export type FixtureManifest = {
  namespace: string;
  userId: string;
  vendorId: string;
  controlUserId?: string;
  controlVendorId?: string;
  customerId?: string;
  orderId?: string;
  reviewId?: string;
  disputeId?: string;
  menuId?: string;
  menuItemId?: string;
  draftId?: string;
};

/** Only the separately approved, explicitly marked fixtures may be changed. */
export async function productionUploadFixtures(api: string) {
  const db = process.env.PROD_DIRECT_URL ?? process.env.PROD_DATABASE_URL;
  const key = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.TEST_FACTORY_PASSWORD;
  if (!db || !key || !password) throw new Error('CONFIGURATION_MISSING');
  const target = new URL(db);
  const ref =
    /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(target.username))?.[1] ??
    /^db\.([a-z0-9]+)\.supabase\.co$/.exec(target.hostname)?.[1];
  const healthResponse = await fetch(`${api}/v1/health/z`);
  const health = await healthResponse.json();
  if (
    !healthResponse.ok ||
    !ref ||
    (health.data ?? health).checks?.supabase?.ref !== ref ||
    (health.data ?? health).checks?.supabase?.environment !== 'production' ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(`//${ref}.`)
  )
    throw new Error('VERIFIED_DISTINCT_PRODUCTION_TARGET_REQUIRED');
  const file = `${proofDirectory}/vendor-manifest.json`;
  if (!existsSync(file)) throw new Error('APPROVED_PRIMARY_FIXTURE_REQUIRED');
  const manifest: FixtureManifest = JSON.parse(readFileSync(file, 'utf8'));
  if (!/^fx03-proof-[a-f0-9]{12}$/.test(manifest.namespace))
    throw new Error('INVALID_FIXTURE_NAMESPACE');
  const prisma = new PrismaClient({ datasources: { db: { url: db } } });
  const auth = createClient(`https://${ref}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const save = () => writeFileSync(file, JSON.stringify(manifest, null, 2));
  async function assertOwner(userId: string, email: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.isTestData || user.email !== email) throw new Error('UNOWNED_TEST_ACCOUNT');
  }
  await assertOwner(manifest.userId, `tf-${manifest.namespace}@test.feastpot.co.uk`);
  const primary = await prisma.vendor.findUniqueOrThrow({ where: { id: manifest.vendorId } });
  if (primary.userId !== manifest.userId || primary.status === 'live')
    throw new Error('OWNED_UNPUBLISHED_VENDOR_REQUIRED');
  async function createIdentity(kind: 'control' | 'customer', role: UserRole) {
    const email = `tf-${manifest.namespace}-${kind}@test.feastpot.co.uk`;
    const created = await auth.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role, app_role: role, is_test_data: true },
      user_metadata: { test_namespace: manifest.namespace },
    });
    if (created.error || !created.data.user) throw new Error('FIXTURE_AUTH_CREATION_FAILED');
    const id = created.data.user.id;
    if (kind === 'control') manifest.controlUserId = id;
    else manifest.customerId = id;
    save();
    await prisma.user.create({
      data: {
        id,
        email,
        role,
        firstName: 'PRODUCTION TEST',
        lastName: kind.toUpperCase(),
        isTestData: true,
        provenance: 'test-factory',
      },
    });
  }
  if (!manifest.controlUserId) await createIdentity('control', UserRole.vendor);
  if (!manifest.customerId) await createIdentity('customer', UserRole.customer);
  await assertOwner(
    manifest.controlUserId!,
    `tf-${manifest.namespace}-control@test.feastpot.co.uk`,
  );
  await assertOwner(manifest.customerId!, `tf-${manifest.namespace}-customer@test.feastpot.co.uk`);
  if (!manifest.controlVendorId) {
    const vendor = await prisma.vendor.create({
      data: {
        userId: manifest.controlUserId!,
        businessName: 'PRODUCTION TEST ONLY: privacy control',
        slug: `${manifest.namespace}-control`,
        status: 'approved',
      },
    });
    manifest.controlVendorId = vendor.id;
    save();
  }
  if (!manifest.orderId) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `FX03-${manifest.namespace.slice(-12)}`,
        customerId: manifest.customerId!,
        vendorId: manifest.vendorId,
        status: 'cancelled',
        deliveryType: 'collection',
        subtotalPence: 0,
        totalPence: 0,
      },
    });
    manifest.orderId = order.id;
    save();
  }
  const order = await prisma.order.findUniqueOrThrow({ where: { id: manifest.orderId } });
  if (
    order.customerId !== manifest.customerId ||
    order.vendorId !== manifest.vendorId ||
    order.status !== 'cancelled' ||
    order.totalPence !== 0
  )
    throw new Error('OWNED_CANCELLED_ZERO_ORDER_REQUIRED');
  if (!manifest.reviewId) {
    const review = await prisma.review.create({
      data: {
        orderId: order.id,
        vendorId: manifest.vendorId,
        customerId: manifest.customerId!,
        rating: 5,
        isHidden: true,
      },
    });
    manifest.reviewId = review.id;
    save();
  }
  if (!manifest.disputeId) {
    const dispute = await prisma.dispute.create({
      data: {
        orderId: order.id,
        raisedById: manifest.customerId!,
        issueType: 'missing_items',
        description: 'PRODUCTION TEST ONLY: private upload fixture, no financial action',
      },
    });
    manifest.disputeId = dispute.id;
    save();
  }
  if (!manifest.menuId) {
    const menu = await prisma.menu.create({
      data: {
        vendorId: manifest.vendorId,
        name: 'PRODUCTION TEST ONLY: unpublished upload matrix',
        isActive: false,
        items: {
          create: {
            vendorId: manifest.vendorId,
            name: 'PRODUCTION TEST ONLY: held upload fixture',
            category: 'main',
            pricePence: 0,
            imageUrls: [],
            allergens: [],
            tags: [],
            isAvailable: false,
            moderationStatus: 'held',
          },
        },
      },
      include: { items: true },
    });
    manifest.menuId = menu.id;
    manifest.menuItemId = menu.items[0]!.id;
    save();
  }
  const resumeToken = createHmac('sha256', password)
    .update(`draft:${manifest.namespace}`)
    .digest('hex');
  if (!manifest.draftId) {
    const draft = await prisma.vendorApplication.create({
      data: {
        fullName: 'PRODUCTION TEST ONLY',
        kitchenName: 'PRODUCTION TEST ONLY: private application draft',
        email: `tf-${manifest.namespace}-draft@test.feastpot.co.uk`,
        phone: '07000000000',
        postcode: 'SE15 4EE',
        cuisineType: '',
        kitchenType: '',
        hasFsaRegistration: false,
        foodStory: '',
        isTestData: true,
        submittedAt: null,
        currentStep: 'phase_2_menu',
        resumeTokenHash: createHash('sha256').update(resumeToken).digest('hex'),
        resumeExpiresAt: new Date(Date.now() + 86400000),
      },
    });
    manifest.draftId = draft.id;
    save();
  }
  async function token(kind: 'primary' | 'control' | 'customer') {
    const suffix = kind === 'primary' ? '' : `-${kind}`;
    // A sign-in changes the client's Storage bearer token. Keep the
    // administrative client unsigned-in and use a separate login client.
    const login = createClient(`https://${ref}.supabase.co`, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await login.auth.signInWithPassword({
      email: `tf-${manifest.namespace}${suffix}@test.feastpot.co.uk`,
      password,
    });
    if (session.error || !session.data.session) throw new Error('REAL_FIXTURE_LOGIN_FAILED');
    return session.data.session.access_token;
  }
  return {
    manifest,
    prisma,
    auth,
    ref,
    resumeToken,
    tokens: {
      primary: await token('primary'),
      control: await token('control'),
      customer: await token('customer'),
    },
  };
}
