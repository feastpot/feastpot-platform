/**
 * Opt-in workspace-only private Storage regression. No queue/AppModule startup.
 * Use --baseline before applying the hook repair to reproduce the original 500.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import { mapUser } from '../apps/api/src/auth/guards/supabase-auth.guard';
import { TestDataFactory, type FactoryState, type TestIdentity } from './test-factory';

const baseline = process.argv.includes('--baseline');
const namespace = `storage-proof-${Date.now()}`;
const base = `https://${process.env.REPLIT_DEV_DOMAIN}/v1`;
const factory = TestDataFactory.fromEnvironment({ namespace });
const otherFactory = TestDataFactory.fromEnvironment({ namespace: `${namespace}-other` });
const clients = { auth: { persistSession: false, autoRefreshToken: false } };
const storageAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  clients,
);
const authClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  clients,
);
const identities: TestIdentity[] = [];
let other: TestIdentity | undefined;
let privatePath: string | undefined;
const publicPath = `tests/${namespace}/fixture.png`;
const results: Record<string, unknown>[] = [];
const claimsResults: Record<string, unknown>[] = [];

async function request(name: string, url: string, token?: string) {
  const response = await fetch(url, {
    headers: token
      ? { Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }
      : {},
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const row: Record<string, unknown> = { name, http: response.status };
  if (!response.ok) {
    // Keep only stable error classifications, not URLs, credentials or user data.
    const error = JSON.parse(bytes.toString('utf8') || '{}');
    row.error = error.error ?? error.code ?? null;
    row.storageStatus = error.statusCode ?? null;
  }
  results.push(row);
  console.log('PRIVATE_STORAGE_CASE', JSON.stringify(row));
  return { status: response.status, bytes };
}

async function tokenFor(identity: TestIdentity, source = factory) {
  const token = await source.issueAccessToken(identity);
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
  const { data, error } = await authClient.auth.getUser(token);
  assert.ifError(error);
  assert(data.user);
  assert.equal(mapUser(data.user, token).role, identity.credentials.role);
  if (!baseline) {
    assert.equal(payload.role, 'authenticated');
    assert.equal(payload.app_role, identity.credentials.role);
  }
  claimsResults.push({
    expectedRole: identity.credentials.role,
    databaseRole: payload.role,
    appRole: payload.app_role ?? null,
    mappingPass: true,
  });
  return token;
}

async function main() {
  assert(process.env.REPLIT_DEV_DOMAIN && process.env.NODE_ENV !== 'production');
  const healthResponse = await fetch(`${base}/health/z`);
  const health = await healthResponse.json();
  assert.equal((health.data ?? health).checks?.supabase?.environment, 'development');
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  assert.equal(new URL(process.env.SUPABASE_DIRECT_URL!).username.split('.')[1], project);
  const owner = await factory.create('V4');
  identities.push(owner);
  other = await otherFactory.create('V4');
  assert.notEqual(other.userId, owner.userId);
  const ownerToken = await tokenFor(owner);
  const otherToken = await tokenFor(other, otherFactory);
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#128a7c' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('type', 'insurance');
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'fixture.png');
  const uploaded = await fetch(`${base}/vendors/${owner.vendorId}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const uploadBody = await uploaded.json();
  const document = uploadBody.data ?? uploadBody;
  privatePath = decodeURIComponent(
    new URL(document.fileUrl).pathname.split('/feastpot-documents/')[1]!,
  );
  assert(privatePath);
  const publicUpload = await storageAdmin.storage.from('feastpot-media').upload(publicPath, bytes, {
    contentType: 'image/png',
  });
  assert.ifError(publicUpload.error);
  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object`;
  const privateUrl = `${storageBase}/authenticated/feastpot-documents/${privatePath}`;
  const apiUrl = `${base}/vendors/${owner.vendorId}/documents/${document.id}/download`;

  assert(
    [400, 401, 403, 404].includes((await request('private Storage signed out', privateUrl)).status),
  );
  for (const [label, token] of [
    ['owner', ownerToken],
    ['other vendor', otherToken],
  ]) {
    const result = await request(`private Storage ${label}`, privateUrl, token);
    if (baseline) assert.equal(result.status, 500);
    else assert([400, 403, 404].includes(result.status));
  }
  const serviceRead = await storageAdmin.storage.from('feastpot-documents').download(privatePath);
  assert.ifError(serviceRead.error);
  assert(serviceRead.data);
  assert.deepEqual(Buffer.from(await serviceRead.data.arrayBuffer()), bytes);
  assert.equal((await request('private API signed out', apiUrl)).status, 401);
  assert.equal((await request('private API other vendor', apiUrl, otherToken)).status, 403);
  const ownerRead = await request('private API owner', apiUrl, ownerToken);
  assert.equal(ownerRead.status, 200);
  assert.deepEqual(ownerRead.bytes, bytes);
  const publicRead = await request(
    'public image signed out',
    `${storageBase}/public/feastpot-media/${publicPath}`,
  );
  assert.equal(publicRead.status, 200);
  assert.deepEqual(publicRead.bytes, bytes);

  if (!baseline) {
    // A2 is a real AAL2 session; do not bypass the staff MFA requirement.
    for (const state of ['C1', 'A2', 'A3', 'A4', 'A5'] as FactoryState[]) {
      const identity = await factory.create(state);
      identities.push(identity);
      const token = await tokenFor(identity);
      if (state === 'A2') {
        const staffRead = await request('private API AAL2 admin', apiUrl, token);
        assert.equal(staffRead.status, 200);
        assert.deepEqual(staffRead.bytes, bytes);
      }
      if (state === 'C1')
        assert.equal((await request('private API customer', apiUrl, token)).status, 403);
    }
  }
}

main()
  .catch(() => {
    console.error('PRIVATE_STORAGE_FAILED: check the last recorded case; secrets are not logged');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (privatePath) await storageAdmin.storage.from('feastpot-documents').remove([privatePath]);
    await storageAdmin.storage.from('feastpot-media').remove([publicPath]);
    for (const identity of identities) await factory.teardown(identity);
    if (other) await otherFactory.teardown(other);
    await otherFactory.dispose();
    await factory.dispose();
    mkdirSync('.local', { recursive: true });
    writeFileSync(
      `.local/private-storage-${baseline ? 'before' : 'after'}.json`,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          environment: 'development',
          pass: !process.exitCode,
          results,
          claimsResults,
        },
        null,
        2,
      ),
    );
    console.log(
      'PRIVATE_STORAGE_SUMMARY',
      JSON.stringify({
        baseline,
        pass: !process.exitCode,
        cases: results.length,
        roleMappings: claimsResults.length,
      }),
    );
  });
