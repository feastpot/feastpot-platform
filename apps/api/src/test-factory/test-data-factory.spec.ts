import { assertSafeDatabaseUrl } from '../../../../scripts/test-factory';

describe('test data factory safety guard', () => {
  it('accepts a local or ephemeral database URL', () => {
    expect(() =>
      assertSafeDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:5432/feastpot_test'),
    ).not.toThrow();
  });

  it('rejects a production-looking database URL', () => {
    expect(() =>
      assertSafeDatabaseUrl('postgresql://postgres:secret@db.production.example/feastpot'),
    ).toThrow('TEST_FACTORY_PRODUCTION_GUARD');
  });

  it('requires an explicit target database', () => {
    expect(() => assertSafeDatabaseUrl(undefined)).toThrow('TEST_FACTORY_DATABASE_REQUIRED');
  });
});
