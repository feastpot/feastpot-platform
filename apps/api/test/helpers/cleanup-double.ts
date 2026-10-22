import { type FactoryState, type TestIdentity } from '../../../../scripts/test-factory';

type Row = Record<string, unknown> & { id: string };
type Query = { where?: Record<string, unknown>; select?: Record<string, unknown> };

const models = [
  'user',
  'vendor',
  'vendorApplication',
  'order',
  'payment',
  'cateringBooking',
  'cateringEnquiry',
  'chargeback',
  'payout',
  'dispute',
  'orderItem',
  'orderAttribution',
  'orderCommission',
  'feastPassSubscription',
  'address',
  'termsAcceptance',
  'vendorEnforcementAction',
  'vendorDocument',
  'deliveryConfig',
  'menuItem',
  'menu',
  'termsVersion',
] as const;
type Model = (typeof models)[number];

/** Stateful, fail-closed subset of Prisma filters used by factory cleanup. */
export function cleanupDouble() {
  const rows = Object.fromEntries(models.map((model) => [model, []])) as Record<Model, Row[]>;
  const validate = (where: Query['where'], model: Model): void => {
    if (!where || !Object.keys(where).length) throw new Error('Unscoped test-double query');
    for (const [key, value] of Object.entries(where)) {
      if (key === 'OR') {
        if (!Array.isArray(value) || !value.length) throw new Error('Unsupported OR filter');
        value.forEach((clause) => validate(clause, model));
      } else if (key === 'acceptances' && model === 'termsVersion') {
        if (JSON.stringify(value) !== '{"none":{}}') throw new Error('Unsupported relation filter');
      } else if (value !== null && typeof value === 'object') {
        const filter = value as Record<string, unknown>;
        if (Object.keys(filter).length !== 1 || !Array.isArray(filter.in)) {
          throw new Error(`Unsupported filter: ${key}`);
        }
      }
    }
  };
  const matches = (row: Row, where: NonNullable<Query['where']>, model: Model): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') {
        return (value as NonNullable<Query['where']>[]).some((clause) =>
          matches(row, clause, model),
        );
      }
      if (key === 'acceptances' && model === 'termsVersion') {
        return !rows.termsAcceptance.some((acceptance) => acceptance.termsVersionId === row.id);
      }
      if (value !== null && typeof value === 'object') {
        return (value as { in: unknown[] }).in.includes(row[key]);
      }
      return row[key] === value;
    });
  const prisma = Object.fromEntries(
    models.map((model) => {
      const findMany = jest.fn(async ({ where }: Query) => {
        validate(where, model);
        return rows[model].filter((row) => matches(row, where!, model));
      });
      return [
        model,
        {
          findMany,
          findUnique: jest.fn(async (query: Query) => (await findMany(query))[0] ?? null),
          findFirst: jest.fn(async (query: Query) => (await findMany(query))[0] ?? null),
          deleteMany: jest.fn(async ({ where }: Query) => {
            validate(where, model);
            const removed = rows[model].filter((row) => matches(row, where!, model));
            rows[model] = rows[model].filter((row) => !removed.includes(row));
            return { count: removed.length };
          }),
          upsert: jest.fn(
            async ({ where, create, update }: Query & { create: Row; update: Partial<Row> }) => {
              validate(where, model);
              const existing = rows[model].find((row) => matches(row, where!, model));
              if (existing) return Object.assign(existing, update);
              rows[model].push(create);
              return create;
            },
          ),
          create: jest.fn(async ({ data }: { data: Row }) => {
            rows[model].push(data);
            return data;
          }),
        },
      ];
    }),
  ) as Record<
    Model,
    {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
      upsert: jest.Mock;
      create: jest.Mock;
    }
  >;
  const transaction = jest.fn(async (run: (tx: typeof prisma) => Promise<void>) => run(prisma));
  const authUsers: Row[] = [];
  const authErrors = new Map<string, { status?: number; code?: string; message: string }>();
  const objects: Array<{ bucket: string; path: string }> = [];
  const remove = jest.fn(async (bucket: string, paths: string[]) => {
    for (let index = objects.length - 1; index >= 0; index--) {
      if (objects[index].bucket === bucket && paths.includes(objects[index].path)) {
        objects.splice(index, 1);
      }
    }
    return { error: null };
  });
  const admin = {
    auth: {
      admin: {
        listUsers: jest.fn(async ({ page, perPage }: { page: number; perPage: number }) => ({
          data: { users: authUsers.slice((page - 1) * perPage, page * perPage) },
          error: null,
        })),
        createUser: jest.fn(async ({ email }: { email: string }) => {
          const user = { id: `auth-${email}`, email };
          authUsers.push(user);
          return { data: { user }, error: null };
        }),
        updateUserById: jest.fn(async () => ({ error: null })),
        deleteUser: jest.fn(async (id: string) => {
          const error = authErrors.get(id);
          if (error) return { error };
          const index = authUsers.findIndex((user) => user.id === id);
          if (index < 0) return { error: { status: 404, message: 'User not found' } };
          authUsers.splice(index, 1);
          return { error: null };
        }),
      },
    },
    storage: {
      from: jest.fn((bucket: string) => ({
        list: jest.fn(async (prefix: string) => ({
          data: objects
            .filter((object) => object.bucket === bucket && object.path.startsWith(`${prefix}/`))
            .map((object) => ({ id: object.path, name: object.path.slice(prefix.length + 1) })),
          error: null,
        })),
        remove: (paths: string[]) => remove(bucket, paths),
      })),
    },
  };
  const seed = (namespace: string, state: FactoryState = 'V5', key = `${namespace}-${state}`) => {
    const email = `tf-${namespace}-${state.toLowerCase()}@test.feastpot.co.uk`;
    const user = { id: `${key}-user`, email };
    const vendor = {
      id: `${key}-vendor`,
      userId: user.id,
      slug: `test-factory-${namespace}-${state.toLowerCase()}`,
    };
    rows.user.push(user);
    rows.vendor.push(vendor);
    rows.vendorApplication.push({ id: `${key}-application`, email, isTestData: true });
    rows.menu.push({ id: `${key}-menu`, vendorId: vendor.id });
    rows.menuItem.push({ id: `${key}-item`, vendorId: vendor.id });
    authUsers.push({ ...user });
    const object = {
      bucket: 'feastpot-documents',
      path: `test-factory/${namespace}/${state.toLowerCase()}/insurance.pdf`,
    };
    objects.push(object);
    const identity: TestIdentity = {
      state,
      credentials: { email, password: 'dummy-test-password', role: 'vendor' },
      userId: user.id,
      vendorId: vendor.id,
      vendorApplicationId: `${key}-application`,
      relatedUserIds: [],
      relatedVendorIds: [],
      storageObjects: [object],
    };
    return identity;
  };
  return {
    rows,
    prisma: { ...prisma, $transaction: transaction },
    admin,
    authUsers,
    authErrors,
    objects,
    remove,
    seed,
  };
}
