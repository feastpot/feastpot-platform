import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isAdminMfaEnforced } from './mfa-enforcement';

const originalServerFlag = process.env.ADMIN_REQUIRE_AAL2;
const originalPublicFlag = process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2;

afterEach(() => {
  if (originalServerFlag === undefined) delete process.env.ADMIN_REQUIRE_AAL2;
  else process.env.ADMIN_REQUIRE_AAL2 = originalServerFlag;

  if (originalPublicFlag === undefined) delete process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2;
  else process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AAL2 = originalPublicFlag;
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
