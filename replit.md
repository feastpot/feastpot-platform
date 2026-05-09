# Feastpot Platform

UK diaspora bulk food marketplace — monorepo scaffold.

## Stack
- Node.js 22 (npm workspaces + Turborepo)
- NestJS 11 backend (`apps/api`)
- Next.js 15 frontends (`apps/web`, `apps/vendor`, `apps/admin`)
- Shared packages: `@feastpot/types`, `@feastpot/ui`, `@feastpot/config`
- Prisma 5 (`prisma/schema.prisma`)

## Layout
```
apps/
  api/      NestJS 11 backend
  web/      Next.js 15 customer PWA
  vendor/   Next.js 15 vendor portal
  admin/    Next.js 15 admin panel
packages/
  types/    Shared Prisma types + Zod schemas
  config/   Shared tsconfig + eslint config
  ui/       Shared shadcn/ui component library
prisma/     schema.prisma + seed.ts
```

## Common scripts
- `npm run dev` — turbo dev across workspaces
- `npm run build` / `npm run typecheck` / `npm run lint` / `npm run test`
- `npm run db:generate | db:migrate | db:deploy | db:seed | db:studio | db:validate`
- `npm run ci` — lint + typecheck + test + build

## User preferences
(none yet)
