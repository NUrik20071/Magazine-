# Тихо — магазин товаров

Интернет-магазин товаров для дома с каталогом, локальной корзиной и закрытой админкой для управления товарами.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/product-store` — storefront, cart, sign-in, and administrator UI
- `artifacts/api-server/src/routes/products.ts` — product catalog and admin API
- `artifacts/api-server/src/middlewares/adminAuth.ts` — server-side admin allowlist check
- `lib/db/src/schema/products.ts` — persistent product schema
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- Public visitors can read active products; all product writes and admin summaries require an authenticated, verified email in `ADMIN_EMAILS`.
- An empty `ADMIN_EMAILS` value denies admin access rather than opening the panel to everyone.

## Product

- Russian-language storefront with catalog search, category filtering, and a browser-persisted cart
- Admin-only overview and product create, edit, and delete actions

## User preferences

- Admin sign-in uses email for the first version; phone and social sign-in are deferred.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
