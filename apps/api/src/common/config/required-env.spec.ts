import { assertProductionAdminMfaEnforced } from './required-env';

describe('assertProductionAdminMfaEnforced', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdminRequireAal2 = process.env.ADMIN_REQUIRE_AAL2;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAdminRequireAal2 === undefined) {
      delete process.env.ADMIN_REQUIRE_AAL2;
    } else {
      process.env.ADMIN_REQUIRE_AAL2 = originalAdminRequireAal2;
    }
  });

  it.each([undefined, '', 'false', 'TRUE'])(
    'refuses production startup when ADMIN_REQUIRE_AAL2 is %p',
    (value) => {
      process.env.NODE_ENV = 'production';
      if (value === undefined) {
        delete process.env.ADMIN_REQUIRE_AAL2;
      } else {
        process.env.ADMIN_REQUIRE_AAL2 = value;
      }

      expect(() => assertProductionAdminMfaEnforced()).toThrow(
        'ADMIN_REQUIRE_AAL2 must be exactly "true"',
      );
    },
  );

  it('allows production startup only when ADMIN_REQUIRE_AAL2 is exactly true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_REQUIRE_AAL2 = 'true';

    expect(() => assertProductionAdminMfaEnforced()).not.toThrow();
  });

  it('does not block non-production startup', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ADMIN_REQUIRE_AAL2;

    expect(() => assertProductionAdminMfaEnforced()).not.toThrow();
  });
});
