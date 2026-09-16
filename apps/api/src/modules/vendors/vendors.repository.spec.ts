import type { PrismaService } from '../../prisma/prisma.service';

import { VendorRepository } from './vendors.repository';

describe('VendorRepository public search provenance', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('excludes persisted seed vendors from the production public-search query', async () => {
    process.env.NODE_ENV = 'production';
    const queryRaw = jest.fn().mockResolvedValue([]);
    const repository = new VendorRepository({ $queryRaw: queryRaw } as unknown as PrismaService);

    await repository.search({ limit: 20 }, null);

    const query = queryRaw.mock.calls[0]?.[0] as { strings: readonly string[] };
    expect(query.strings.join('')).toContain('AND v.is_seed_data = false');
  });
});
