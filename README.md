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
