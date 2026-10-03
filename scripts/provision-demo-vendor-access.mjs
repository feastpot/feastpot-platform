// Provision access only for the explicitly marked production demo vendor.
// Default is a read-only preview. Applying requires an explicit production
// confirmation and a recipient supplied at invocation time (never stored here).
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const slug = 'demo-lagos-table';
const provenance = 'nigerian-demo-vendor';
const advisoryLockKey = provenance;
const defaultVendorPortalUrl = 'https://vendor.feastpot.co.uk';

export function parseArguments(argv) {
  const options = { apply: false, confirmProduction: false, email: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      options.apply = true;
    } else if (argument === '--confirm-production') {
      options.confirmProduction = true;
    } else if (argument === '--email') {
      if (options.email !== undefined || !argv[index + 1] || argv[index + 1].startsWith('--')) {
        throw new Error('Supply exactly one valid --email value.');
      }
      options.email = argv[++index];
    } else if (argument.startsWith('--email=')) {
      if (options.email !== undefined) throw new Error('Supply exactly one valid --email value.');
      options.email = argument.slice('--email='.length);
    } else {
      throw new Error('Unsupported provisioning option.');
    }
  }

  if (options.confirmProduction && !options.apply) {
    throw new Error('--confirm-production is only valid with --apply.');
  }
  if (options.apply && !options.confirmProduction) {
    throw new Error('Production writes require --apply --confirm-production.');
  }
  if (options.email !== undefined) options.email = normalizeEmail(options.email);
  if (options.apply && !options.email) {
    throw new Error('Applying requires a valid --email value.');
  }
  return options;
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new Error('Supply a valid --email value.');
  const email = value.trim().toLowerCase();
  const [local, domain, ...extra] = email.split('@');
  const validDomain =
    typeof domain === 'string' &&
    domain.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain);
  if (
    email.length > 254 ||
    local.length < 1 ||
    local.length > 64 ||
    /\s/.test(email) ||
    extra.length > 0 ||
    !validDomain
  ) {
    throw new Error('Supply a valid --email value.');
  }
  return email;
}

export function deriveProductionSupabaseUrl(directUrl) {
  let databaseUrl;
  try {
    databaseUrl = new URL(directUrl);
  } catch {
    throw new Error('PROD_DIRECT_URL must be a valid Supabase PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('PROD_DIRECT_URL must be a valid Supabase PostgreSQL URL.');
  }

  const databaseHost = databaseUrl.hostname.toLowerCase();
  const directDatabaseMatch = databaseHost.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  const poolerUsernameMatch = decodeURIComponent(databaseUrl.username).match(
    /^postgres\.([a-z0-9]+)$/i,
  );
  const projectRef = directDatabaseMatch?.[1] ?? poolerUsernameMatch?.[1]?.toLowerCase();
  const isSupportedHost =
    directDatabaseMatch !== null ||
    (databaseHost.endsWith('.pooler.supabase.com') && Boolean(poolerUsernameMatch));
  if (!projectRef || !isSupportedHost) {
    throw new Error(
      'PROD_DIRECT_URL must target db.<project-ref>.supabase.co or a Supabase pooler user postgres.<project-ref>.',
    );
  }
  return `https://${projectRef}.supabase.co`;
}

function productionDemoIsEligible(vendor) {
  return Boolean(
    vendor &&
      vendor.slug === slug &&
      vendor.status === 'pending' &&
      vendor.publicDemo === true &&
      vendor.isSeedData === false &&
      vendor.user?.role === 'vendor' &&
      vendor.user?.isTestData === true &&
      vendor.user?.provenance === provenance &&
      vendor.payoutsEnabled === false &&
      vendor.stripeChargesEnabled === false &&
      vendor.stripePayoutsEnabled === false &&
      vendor.stripeAccountId === null,
  );
}

function vendorConfirmationUrl(configuredBase) {
  let portal;
  try {
    portal = new URL(configuredBase);
  } catch {
    throw new Error('VENDOR_PORTAL_URL must be a valid HTTPS origin.');
  }
  if (
    portal.protocol !== 'https:' ||
    portal.username ||
    portal.password ||
    portal.search ||
    portal.hash ||
    !['', '/'].includes(portal.pathname)
  ) {
    throw new Error('VENDOR_PORTAL_URL must be a valid HTTPS origin.');
  }
  return new URL('/auth/confirm', portal.origin).toString();
}

async function findDemoVendor(client) {
  const vendor = await client.vendor.findUnique({
    where: { slug },
    include: { user: true },
  });
  if (!productionDemoIsEligible(vendor)) {
    throw new Error('The production demo record is missing or does not match its safety markers.');
  }
  return vendor;
}

async function preflightAuthEmail(tx, ownerId, email) {
  const conflicts = await tx.$queryRaw`
    SELECT id::text AS id
    FROM public.users
    WHERE lower(email) = lower(${email}) AND id <> ${ownerId}::uuid
    UNION
    SELECT id::text AS id
    FROM auth.users
    WHERE lower(email) = lower(${email}) AND id <> ${ownerId}::uuid
    LIMIT 1
  `;
  if (conflicts.length > 0) {
    throw new Error('The requested email is already attached to a different account.');
  }

  return tx.$queryRaw`
    SELECT id::text AS id, email_confirmed_at IS NOT NULL AS confirmed
    FROM auth.users
    WHERE id = ${ownerId}::uuid
    LIMIT 1
  `;
}

export function resolveAuthUserLookup({ data, error, databaseIdentity }) {
  if (error) {
    if (error.status === 404 && error.code === 'user_not_found') {
      if (databaseIdentity.length === 0 && !data?.user) return null;
      throw new Error('Production auth identity checks did not agree; refusing to continue.');
    }
    throw new Error('Could not safely inspect the production auth identity.');
  }
  const authUser = data?.user ?? null;
  if (Boolean(authUser) !== Boolean(databaseIdentity.length)) {
    throw new Error('Production auth identity checks did not agree; refusing to continue.');
  }
  if (
    authUser &&
    Boolean(authUser.email_confirmed_at) !== (databaseIdentity[0]?.confirmed === true)
  ) {
    throw new Error('Production auth identity checks did not agree; refusing to continue.');
  }
  return authUser;
}

async function readExistingAuthUser(supabase, ownerId, databaseIdentity) {
  return resolveAuthUserLookup({
    ...(await supabase.auth.admin.getUserById(ownerId)),
    databaseIdentity,
  });
}

async function provisionInDatabase(prisma, supabase, email) {
  let createdIdentityId = null;
  let createdIdentityEmail = null;
  let createdIdentityAt = null;
  let compensated = false;
  let ownerId = null;
  let vendorId = null;
  let previousAuditId = null;
  let createdAuditId = null;
  let confirmed = false;

  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${advisoryLockKey}))`;
        const vendor = await findDemoVendor(tx);
        ownerId = vendor.userId;
        vendorId = vendor.id;
        const previousAudit = await tx.auditLog.findFirst({
          where: {
            action: 'demo_access_provisioned',
            entityType: 'Vendor',
            entityId: vendor.id,
            provenance,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        });
        previousAuditId = previousAudit?.id ?? null;

        const databaseIdentity = await preflightAuthEmail(tx, vendor.userId, email);
        const existingAuthUser = await readExistingAuthUser(
          supabase,
          vendor.userId,
          databaseIdentity,
        );
        if (existingAuthUser && existingAuthUser.email?.toLowerCase() !== email) {
          throw new Error('The existing demo auth identity has a different email; refusing to alter it.');
        }

        confirmed = databaseIdentity[0]?.confirmed === true;
        if (!existingAuthUser) {
          const { data, error } = await supabase.auth.admin.createUser({
            id: vendor.userId,
            email,
            email_confirm: false,
            app_metadata: { role: 'vendor' },
          });
          if (error || !data?.user?.id) {
            throw new Error('Could not create the production auth identity.');
          }
          createdIdentityId = data.user.id;
          createdIdentityEmail = data.user.email?.toLowerCase() ?? null;
          createdIdentityAt = data.user.created_at ?? null;
          if (data.user.id !== vendor.userId) {
            const { error: deleteError } = await supabase.auth.admin.deleteUser(createdIdentityId);
            if (deleteError) {
              throw new Error(
                'Supabase returned an unexpected auth identity and compensation could not remove it.',
              );
            }
            compensated = true;
            throw new Error('Supabase returned an unexpected auth identity; refusing to continue.');
          }
          confirmed = Boolean(data.user.email_confirmed_at);
        }

        // Auth API calls happen before taking a public.users row lock because
        // Auth database triggers may write that row themselves.
        await tx.$executeRawUnsafe('SAVEPOINT demo_vendor_access_db_changes');
        try {
          await tx.user.update({
            where: { id: vendor.userId },
            data: { email, status: 'active' },
          });
          const audit = await tx.auditLog.create({
            data: {
              action: 'demo_access_provisioned',
              entityType: 'Vendor',
              entityId: vendor.id,
              isTestData: true,
              provenance,
              metadata: {
                demo: true,
                publicDemo: true,
                ordersEnabled: false,
                access: 'vendor-auth',
                recipientStored: false,
              },
            },
          });
          createdAuditId = audit.id;
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT demo_vendor_access_db_changes');
        } catch {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT demo_vendor_access_db_changes');
          if (createdIdentityId) {
            const { error: deleteError } = await supabase.auth.admin.deleteUser(createdIdentityId);
            if (deleteError) {
              throw new Error(
                'The database update failed and the newly created auth identity could not be compensated.',
              );
            }
            compensated = true;
          }
          throw new Error('Could not commit the demo owner update and audit record.');
        }

        return { ownerId: vendor.userId, confirmed };
      },
      { maxWait: 10000, timeout: 60000 },
    );
  } catch (transactionError) {
    if (!createdIdentityId || compensated || !ownerId || !vendorId) {
      throw transactionError;
    }

    let recovery = 'unverified';
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${advisoryLockKey}))`;
          const latestAudit = await tx.auditLog.findFirst({
            where: {
              action: 'demo_access_provisioned',
              entityType: 'Vendor',
              entityId: vendorId,
              provenance,
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true },
          });
          if (createdAuditId && latestAudit?.id === createdAuditId) {
            recovery = 'committed';
            return;
          }
          if ((latestAudit?.id ?? null) !== previousAuditId) {
            recovery = 'concurrent-commit';
            return;
          }
          if (
            !createdIdentityAt ||
            createdIdentityEmail !== email
          ) {
            recovery = 'ownership-unverified';
            return;
          }

          const authRows = await tx.$queryRaw`
            SELECT id::text AS id
            FROM auth.users
            WHERE id = ${createdIdentityId}::uuid
              AND lower(email) = lower(${createdIdentityEmail})
              AND created_at = ${createdIdentityAt}::timestamptz
            LIMIT 1
          `;
          if (authRows.length === 0) {
            recovery = 'identity-absent';
            return;
          }

          const { error: deleteError } = await supabase.auth.admin.deleteUser(createdIdentityId);
          if (deleteError) throw new Error('Compensation failed.');
          recovery = 'compensated';
        },
        { maxWait: 10000, timeout: 60000 },
      );
    } catch {
      throw new Error('Auth compensation could not be safely completed; preserve the identity for review.');
    }

    if (recovery === 'committed') return { ownerId, confirmed };
    if (recovery === 'compensated' || recovery === 'identity-absent') {
      throw new Error('Could not commit the demo owner update and audit record.');
    }
    throw new Error('Auth identity is preserved because database commit ownership is uncertain.');
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function sendSetupEmail(supabase, email, confirmed, confirmUrl, resend, setStage) {
  const type = confirmed ? 'recovery' : 'invite';
  setStage('generating the secure vendor setup link');
  const { data, error } = await supabase.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo: confirmUrl },
  });
  const tokenHash = data?.properties?.hashed_token;
  if (
    error ||
    typeof tokenHash !== 'string' ||
    tokenHash.length < 16 ||
    data?.properties?.verification_type !== type ||
    data?.properties?.redirect_to !== confirmUrl
  ) {
    throw new Error('Could not generate a secure production vendor setup link.');
  }

  // Only the hashed token is placed in the URL fragment. Fragments are not
  // sent to the portal server and the raw action_link is never used or logged.
  const setupUrl = `${confirmUrl}#token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
  const safeSetupUrl = escapeHtml(setupUrl);
  setStage('sending the demo setup email');
  const { data: sent, error: sendError } = await resend.emails.send(
    {
      from: process.env.EMAIL_FROM ?? 'Feastpot <noreply@feastpot.co.uk>',
      to: email,
      subject: 'Demo vendor portal setup - Lagos Table',
      html: `
        <div style="margin:0 auto;max-width:560px;padding:32px 24px;font-family:Arial,sans-serif;color:#18343b">
          <p style="margin:0 0 18px;font-size:12px;font-weight:700;letter-spacing:.12em;color:#b45309">DEMO ACCOUNT</p>
          <h1 style="margin:0 0 14px;font-size:24px">Set up Lagos Table access</h1>
          <p style="margin:0 0 14px;line-height:1.6">Use this secure link to ${confirmed ? 'reset the password for' : 'accept the invitation to'} the private Feastpot vendor demo.</p>
          <p style="margin:0 0 24px;line-height:1.6"><strong>Demonstration only:</strong> Lagos Table is fictional, is not accepting orders, and cannot receive payouts.</p>
          <p style="margin:0 0 24px"><a href="${safeSetupUrl}" style="display:inline-block;border-radius:8px;background:#087f78;padding:13px 20px;color:#fff;text-decoration:none;font-weight:700">${confirmed ? 'Continue to password reset' : 'Accept demo invitation'}</a></p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#52676b">If you did not expect this demo access email, you can ignore it.</p>
        </div>
      `,
    },
    { idempotencyKey: `demo-lagos-table-setup-${randomUUID()}` },
  );
  if (sendError || !sent?.id) throw new Error('The demo setup email could not be delivered.');
}

async function main() {
  let stage = 'validating the production target';
  let prisma;
  let ownerProvisioned = false;
  try {
    const options = parseArguments(process.argv.slice(2));
    const directUrl = process.env.PROD_DIRECT_URL;
    if (!directUrl) throw new Error('PROD_DIRECT_URL is required.');
    const supabaseUrl = deriveProductionSupabaseUrl(directUrl);

    if (options.apply) {
      if (!process.env.PROD_SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('PROD_SUPABASE_SERVICE_ROLE_KEY is required to apply.');
      }
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is required to deliver the setup email.');
      }
      vendorConfirmationUrl(process.env.VENDOR_PORTAL_URL ?? defaultVendorPortalUrl);
    }

    prisma = new PrismaClient({
      datasources: { db: { url: directUrl } },
      log: [],
    });

    stage = 'checking the production demo safety markers';
    const vendor = await findDemoVendor(prisma);
    if (!options.apply) {
      if (options.email) {
        const conflicts = await prisma.$queryRaw`
          SELECT id::text AS id
          FROM public.users
          WHERE lower(email) = lower(${options.email}) AND id <> ${vendor.userId}::uuid
          UNION
          SELECT id::text AS id
          FROM auth.users
          WHERE lower(email) = lower(${options.email}) AND id <> ${vendor.userId}::uuid
          LIMIT 1
        `;
        if (conflicts.length > 0) {
          throw new Error('The requested email is already attached to a different account.');
        }
      }
      console.log(
        JSON.stringify({
          preview: true,
          slug,
          eligible: true,
          vendorStatus: vendor.status,
          publicDemo: vendor.publicDemo,
          isSeedData: vendor.isSeedData,
          authChanges: false,
          databaseChanges: false,
          emailSent: false,
        }),
      );
      return;
    }

    const vendorPortalConfirmUrl = vendorConfirmationUrl(
      process.env.VENDOR_PORTAL_URL ?? defaultVendorPortalUrl,
    );
    const supabase = createClient(
      supabaseUrl,
      process.env.PROD_SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const resend = new Resend(process.env.RESEND_API_KEY);

    stage = 'provisioning the demo owner in production';
    const access = await provisionInDatabase(prisma, supabase, options.email);
    ownerProvisioned = true;

    // Hold the same advisory lock during link generation/delivery so concurrent
    // invocations cannot issue setup emails for this demo at the same time.
    stage = 'generating the secure vendor setup link';
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${advisoryLockKey}))`;
        await sendSetupEmail(
          supabase,
          options.email,
          access.confirmed,
          vendorPortalConfirmUrl,
          resend,
          (value) => {
            stage = value;
          },
        );
      },
      { maxWait: 10000, timeout: 60000 },
    );

    console.log(
      JSON.stringify({
        provisioned: true,
        slug,
        emailSent: true,
        authIdentityPreserved: true,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error &&
      [
        'PROD_DIRECT_URL is required.',
        'PROD_SUPABASE_SERVICE_ROLE_KEY is required to apply.',
        'RESEND_API_KEY is required to deliver the setup email.',
        'Production writes require --apply --confirm-production.',
        '--confirm-production is only valid with --apply.',
        'Applying requires a valid --email value.',
        'Unsupported provisioning option.',
        'Supply exactly one valid --email value.',
        'Supply a valid --email value.',
        'PROD_DIRECT_URL must be a valid Supabase PostgreSQL URL.',
        'PROD_DIRECT_URL must target db.<project-ref>.supabase.co or a Supabase pooler user postgres.<project-ref>.',
        'VENDOR_PORTAL_URL must be a valid HTTPS origin.',
        'The production demo record is missing or does not match its safety markers.',
        'The requested email is already attached to a different account.',
        'Could not safely inspect the production auth identity.',
        'Production auth identity checks did not agree; refusing to continue.',
        'The existing demo auth identity has a different email; refusing to alter it.',
        'Supabase returned an unexpected auth identity; refusing to continue.',
        'The database update failed and the newly created auth identity could not be compensated.',
        'Supabase returned an unexpected auth identity and compensation could not remove it.',
        'Could not commit the demo owner update and audit record.',
        'Auth compensation could not be safely completed; preserve the identity for review.',
        'Auth identity is preserved because database commit ownership is uncertain.',
        'Could not generate a secure production vendor setup link.',
        'The demo setup email could not be delivered.',
      ].includes(error?.message)
        ? error.message
        : `The provisioning step failed while ${stage}.`;
    const retryNote = ownerProvisioned
      ? ' The owner remains provisioned and retryable; rerun to create a fresh setup-link attempt.'
      : '';
    console.error(`Demo vendor access failed: ${message}${retryNote}`);
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}