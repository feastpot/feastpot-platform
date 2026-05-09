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

## apps/web (customer PWA)
- Next.js 15 App Router (React 18.3, Tailwind 3.4) on port 3000.
- Reuses shared `@feastpot/ui` (shadcn) — does NOT re-init shadcn locally.
- Brand tokens: `bg-brand` (#E8520A) / `bg-teal` (#1D9E75) / `bg-vendor` (#185FA5); semantic tokens via shadcn HSL vars from `@feastpot/ui/theme.css`.
- Supabase SSR clients in `src/lib/supabase/{client,server,middleware}.ts`; auth-gate middleware refreshes session via `getUser()` (NOT `getSession()`).
- TanStack Query: `staleTime 60s`, `retry 1`, devtools dev-only.
- Basket store: zustand + persist (`feastpot.basket.v1`); cross-vendor adds throw `CrossVendorBasketError`; SSR-safe `createJSONStorage`.
- PWA: static `public/manifest.json` + theme color only. Workbox SW deferred until offline behaviour is needed (use `@ducanh2912/next-pwa` then — `next-pwa` is unmaintained and breaks on Next 15).

## User preferences
(none yet)
