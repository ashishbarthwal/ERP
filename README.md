# ERP

The development application for the ERP environment: a compact, server-rendered
ERP-style site with a REST API.

## Scope

This repository contains only the mini-ERP application. It is intentionally
separate from the Playwright test repository so the application can be deployed
as an independent development, staging, or production-like target.

The application includes:

- cookie-based web authentication and JWT API authentication
- customers, suppliers, products, and inventory
- sales orders, purchase orders, invoices, and payments
- atomic stock reservation, receipt, release, and consumption workflows
- Prisma migrations and deterministic development seed data
- an authenticated operational analytics cockpit with period filters and daily CSV export

## Stack

TypeScript, Node.js, Express, EJS, Prisma, and SQLite for development. The
database layer is structured so a PostgreSQL deployment can be introduced for a
production-like environment.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev
```

The application listens on `http://localhost:4000` by default. Set `PORT` in
`.env` to use another port.

After signing in, open `http://localhost:4000/analytics` for 7/30/90-day
invoicing, collections, purchase receipts, sales pipeline, top products and
current receivables/stock alerts. The **Export daily CSV** button downloads
date-level transaction totals suitable for Power BI Desktop's CSV import.
See [analytics definitions and Power BI steps](docs/ANALYTICS.md).

Do not commit `.env`, `prisma/dev.db`, or production secrets. The development
seed data is for local testing only.

## Verification commands

```powershell
npm run typecheck
npm run build
npm start
```

## Repository boundary

The companion repository, `ai-self-healing-test-automation-framework`, contains
the Playwright tests and CI workflows. It should target a deployed instance of
this application through environment configuration rather than sharing source
files with this repository.

## Automatic change-aware tests

The **Change-aware ERP tests** GitHub workflow runs after a push to `main`, for
same-repository pull requests targeting `main`, and on manual dispatch. It calls
the companion test repository's composite action at a pinned commit. All test
implementation stays in the test repository.

The action analyzes the base/head Git diff, generates Playwright tests from
reviewed contracts, builds this ERP revision, and runs against a fresh temporary
SQLite database. Plans, generated tests, review drafts and reports are attached
to the workflow run as private artifacts. A manual run can execute all 15 contracts.

See the [automation approach and roadmap](https://github.com/ashishbarthwal/ai-self-healing-test-automation-framework/blob/main/docs/CHANGE_AWARE_AUTOMATION.md).
New requirements and changed business behavior still need review; AI healing is
not enabled in this first foundation.

Each completed pipeline run also publishes an `erp-analytics` artifact containing
sanitized run/test history and CSVs for Power BI. In the test repository, use
`npm run analytics:sync` to collect these artifacts and rebuild local report data.
See the [Power BI setup guide](https://github.com/ashishbarthwal/ai-self-healing-test-automation-framework/blob/main/analytics/powerbi/README.md).
