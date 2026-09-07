import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isAdminMfaE2eBypassed, isAdminMfaEnforced } from './mfa-enforcement';

const originalServerFlag = process.env.ADMIN_REQUIRE_AAL2;
const originalPublicFlag = process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2;
const originalCi = process.env.CI;
const originalE2eBypass = process.env.ADMIN_E2E_ALLOW_AAL1;
const originalFactoryNamespace = process.env.TEST_FACTORY_NAMESPACE;

afterEach(() => {
  if (originalServerFlag === undefined) delete process.env.ADMIN_REQUIRE_AAL2;
  else process.env.ADMIN_REQUIRE_AAL2 = originalServerFlag;

  if (originalPublicFlag === undefined) delete process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2;
  else process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2 = originalPublicFlag;

  if (originalCi === undefined) delete process.env.CI;
  else process.env.CI = originalCi;
  if (originalE2eBypass === undefined) delete process.env.ADMIN_E2E_ALLOW_AAL1;
  else process.env.ADMIN_E2E_ALLOW_AAL1 = originalE2eBypass;
  if (originalFactoryNamespace === undefined) delete process.env.TEST_FACTORY_NAMESPACE;
  else process.env.TEST_FACTORY_NAMESPACE = originalFactoryNamespace;
});

describe('isAdminMfaE2eBypassed', () => {
  it('allows AAL1 only for an explicit namespaced Admin factory run in CI', () => {
    process.env.CI = 'true';
    process.env.ADMIN_E2E_ALLOW_AAL1 = 'true';
    process.env.TEST_FACTORY_NAMESPACE = 'admin-34132369659-1';
    assert.equal(isAdminMfaE2eBypassed(), true);
  });

  it('stays disabled outside CI or without the exact namespace shape', () => {
    process.env.CI = 'false';
    process.env.ADMIN_E2E_ALLOW_AAL1 = 'true';
    process.env.TEST_FACTORY_NAMESPACE = 'admin-34132369659-1';
    assert.equal(isAdminMfaE2eBypassed(), false);

    process.env.CI = 'true';
    process.env.TEST_FACTORY_NAMESPACE = 'production';
    assert.equal(isAdminMfaE2eBypassed(), false);
  });
});

describe('isAdminMfaEnforced', () => {
  it('returns true only when both admin flag surfaces are exactly true', () => {
    process.env.ADMIN_REQUIRE_AAL2 = 'true';
    process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2 = 'true';

    assert.equal(isAdminMfaEnforced(), true);
  });

  it('fails closed when the server flag is missing or false', () => {
    process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2 = 'true';
    delete process.env.ADMIN_REQUIRE_AAL2;
    assert.equal(isAdminMfaEnforced(), false);

    process.env.ADMIN_REQUIRE_AAL2 = 'false';
    assert.equal(isAdminMfaEnforced(), false);
  });

  it('fails closed when the public admin flag is missing or false', () => {
    process.env.ADMIN_REQUIRE_AAL2 = 'true';
    delete process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2;
    assert.equal(isAdminMfaEnforced(), false);

    process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2 = 'false';
    assert.equal(isAdminMfaEnforced(), false);
  });
});
