# Magazine- architecture

**Status:** architecture baseline, 2026-11-26  
**Product direction:** a general-purpose visual editor first; publishing, media, catalog and commerce are optional capabilities, not the product's identity.

## Current system (verified from the repository)

Magazine- is a pnpm workspace monorepo:

- `artifacts/api-server`: Express 5 API, Clerk integration, media resolution and storage, catalog and order endpoints.
- `artifacts/product-store`: React 19 + TypeScript + Vite browser application. The current UI is still store-oriented and is not yet the general-purpose editor.
- `artifacts/mockup-sandbox`: separate Vite/React prototype workspace.
- `lib/db`: Drizzle ORM and PostgreSQL schema.
- `lib/api-spec`: OpenAPI source of truth and Orval configuration.
- `lib/api-zod`: generated request/response validators and types.
- `lib/api-client-react`: generated React Query API client.
- `scripts`: workspace utilities.

The root build runs TypeScript project checks and package builds. GitHub Actions currently runs the frozen pnpm install and root build on pull requests and main pushes.

## Target architecture

Use a **modular monolith**, not microservices. Keep one deployable API and one database while enforcing clear domain boundaries.

### Backend domains

| Domain | Responsibility | Direction |
|---|---|---|
| Identity & access | Clerk session integration, administrator/owner policies | Infrastructure + policy boundary |
| Editor | Documents, pages, blocks, document metadata and revisions | Core product |
| Media | Upload validation, asset metadata, storage and safe delivery | Shared capability |
| Publishing | Draft/published state, public read models and publication lifecycle | Core capability |
| Site settings | Per-workspace editor and publication settings | Supporting capability |
| Catalog | Optional structured catalog content | Optional feature |
| Orders | Optional commerce workflow | Optional feature |

Target module shape (introduced gradually, not by a mass file move):

```text
artifacts/api-server/src/
  app.ts
  index.ts
  infrastructure/
    config/
    database/
    observability/
  modules/
    identity/
      routes.ts
      policies/
    editor/
      routes.ts
      schemas.ts
      services/
      repositories/
      domain/
    media/
      routes.ts
      schemas.ts
      services/
      repositories/
    publishing/
    site-settings/
    catalog/       # optional
    orders/        # optional
  shared/
    errors/
    http/
    validation/
```

### Frontend domains

The current `product-store` package is the deployed browser app. Do not rename or relocate it as a first step: its package name and Vite output are wired into the server build and Render deployment.

The editor should become the primary feature boundary inside that application:

```text
artifacts/product-store/src/
  app/                 # providers, routing, application shell
  features/
    editor/             # canvas/workspace, block editing, selection, commands
    documents/          # document list, create/open/duplicate
    media/              # asset browser and upload flows
    publishing/         # preview, publish state, public view
    catalog/             # optional structured content
    commerce/            # optional orders and checkout
  shared/
    ui/
    hooks/
    lib/
    types/
```

These are target boundaries, not a claim that the directories already exist.

## Dependency rules

1. Domain modules own their rules and data access contracts.
2. Routes are transport adapters; business rules live in services/domain code.
3. Repositories isolate Drizzle/SQL from business logic.
4. One domain must not import another domain's private implementation.
5. Cross-domain work uses explicit public interfaces or application services.
6. Shared code is for genuinely cross-cutting primitives, not a dumping ground.
7. Generated OpenAPI/Zod/client output is generated from its source; do not hand-edit generated files.
8. No circular dependencies. No cross-domain direct database writes.
9. Preserve current HTTP contracts during extraction unless a versioned API change is explicitly planned.
10. Keep the deployment as one API + one PostgreSQL database until scale or operational needs justify separation.

## Data model direction

The editor's first durable concepts should be workspace/owner, document, document revision, block, and media asset. Define exact tables only after auditing Clerk identity semantics, existing ownership requirements, and current data. Do not create migrations or rewrite existing tables speculatively.

Commerce tables and routes remain isolated optional modules. The public experience must not require products, categories, carts, or orders.

## Migration strategy

- Add characterization tests around existing behaviour before moving code.
- Extract one backend domain at a time behind the existing route contract.
- Add and verify database migrations before removing runtime schema mutation.
- Build the editor API and its authorization model before the editor UI.
- Replace the shop-first landing/admin experience only after the editor's backend contract is stable.
- Keep old routes/data working until an explicit migration and compatibility window is complete.
