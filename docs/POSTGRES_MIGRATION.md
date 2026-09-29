# PostgreSQL and Neon migration

## Current state

- `prisma/schema.prisma` now targets PostgreSQL.
- The new baseline migration creates the current ERP schema on a fresh database.
- Previous SQLite migration SQL is retained in `prisma/sqlite-legacy/` for reference.
- The ignored local `.env` holds Neon pooled and unpooled URLs from `neon env pull --service postgres`. The linked `development` branch is the local runtime target; `production` has the schema but no demo seed records.
- The `development` branch has the PostgreSQL baseline applied and a minimal demo seed. The local demo administrator's rotated password is in the ignored `.env` as `ERP_DEMO_ADMIN_PASSWORD`.
- `prisma/dev.db` is left untouched. Its records are not copied by the PostgreSQL baseline or seed script.
- The change-aware CI workflow uses an isolated PostgreSQL service and pins the published test-repository runner at `e94324c`. Its full database-backed contract run still needs a successful GitHub Actions result.

## Connect a fresh Neon branch

Create a Neon project for development, then use its **Connect** dialog to copy both connection strings. Use the pooled URL for application traffic and the direct URL for Prisma migration commands. Keep credentials in the ignored `.env` file; do not paste them into source, issues, or chat.

Set:

```dotenv
DATABASE_URL="<Neon pooled PostgreSQL connection string>"
DATABASE_URL_UNPOOLED="<Neon direct PostgreSQL connection string>"
JWT_SECRET="<a long random secret>"
PORT=4000
```

The two URLs are available in Neon Console under **Connect**. Choose the pooled
option for `DATABASE_URL` and the unpooled/direct option for `DATABASE_URL_UNPOOLED`; Prisma
5 supports both values in the datasource block. Do not reuse the test branch URL
for normal development if you want to keep its records isolated.

With that fresh branch selected in `.env`, initialize the schema and sample records:

```powershell
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run db:seed
npm run dev
```

Do not run the baseline against a database that already contains unrelated tables or valuable data. Use a new empty Neon branch for the first connection.

## Test database isolation

The ERP change-aware pipeline now requires `ERP_TEST_DATABASE_URL`, a PostgreSQL URL for a disposable database or Neon test branch. It applies migrations and writes test records there. Never point it at the development branch or a database containing important data. GitHub Actions is configured with a temporary PostgreSQL 16 service; local runs need a separate test branch/database.

## Existing SQLite records

No automatic data copy is part of this schema cutover. First decide whether the current local SQLite records are worth preserving. If they are, make and verify a backup, then use a separately reviewed import/export path that preserves relationships and checks row counts and inventory/payment invariants. If they are only disposable demo data, create a clean Neon branch and run the seed script. Keep `prisma/dev.db` until the chosen path is verified.

## Cutover status and remaining checks

1. Done locally: Neon pooled/unpooled URLs configured, Prisma query confirmed, baseline applied, migration status clean, and minimal demo records seeded on `development`.
2. Done locally: ERP build and authenticated smoke checks for dashboard, analytics, orders, customers, and products.
3. Still required: a successful full browser/API contract run against the workflow's disposable PostgreSQL service. The matching test-repository action revision is published and pinned.
4. Decide whether to import old SQLite records; they have not been copied.
5. Add a backup export and restore drill before treating Neon as storage for business data. Never expose the demo branch or its credentials as production data.

Neon/Prisma connection guidance: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), [Connect Prisma to Neon](https://www.prisma.io/docs/orm/v6/overview/databases/neon), and [Prisma migrate deploy](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production).
