# Mini ERP roadmap

Status: updated 30 September 2026. This is a personal project with one
fictional small distributor as its reference business. It aims to show dependable
business workflows and professional engineering without claiming SAP parity or
becoming a general purpose SaaS platform.

## Current position

The application already connects customers, suppliers, products, inventory,
purchase orders, sales orders, invoices, payments, and operational analytics.
Purchase receipts add stock; confirming a sale reserves stock; invoicing consumes
reserved stock. Price and cost snapshots preserve historical document amounts.
There is a movement history, REST API, server rendered interface, Prisma
migrations, and a separate change aware Playwright workflow.

The earlier assessment was **7.5/10 as a personal project** and **3/10 as a
business deployment**. Treat those as a historical baseline, not a current score.
Since then, the app added role-enforced web/API permissions, pending public
signup with Admin approval, CSRF protection, startup configuration validation,
browser security headers, append-only application audit events, database checks
for core quantities and amounts, and PostgreSQL row locks across the main stock
and money transitions. Payment APIs also support idempotent retries. Local tests
and a separate reviewed Playwright contract suite cover these behaviors. The
site is still not ready for live business data: login/signup throttling, email
ownership verification, password recovery and session revocation, deployment
monitoring, backup/restore drills, broader failure recovery, and signed-in
desktop/mobile usability review remain open. A passing build and health response
do not establish production readiness.

## Product boundary

- One company and one coherent demo dataset. Avoid tenancy, marketplaces, or a
  plugin platform until the core can be operated reliably.
- Give the project its own name, visual language, terminology, and sample data.
  Take inspiration from integrated ERP workflows, not another product's screens.
- Make operational reports explicit about what their numbers mean. Do not label
  collections minus purchases as profit. Do not claim full accounting until
  journals, reconciliation, and accounting rules exist.
- Prefer a complete workflow with tests and recovery over another shallow module.

## Milestones

The effort estimates assume one developer working part time. They are planning
ranges, not release commitments. Finish each exit criterion before starting the
next milestone.

### 0. Define the business contract (2 to 4 days)

1. Write a one page story for the fictional distributor: users, products, a
   supplier, a customer, and the purchase to sale to payment journey.
2. Document the allowed state transitions for purchase orders, sales orders,
   invoices, and inventory. Decide whether invoice creation means shipment in
   this intentionally simplified model.
3. Write a permission matrix for Admin, Sales, Purchasing, and Inventory roles.
   Include every page and API mutation, plus analytics export.
4. Capture current desktop and mobile screenshots and a short usability review:
   keyboard navigation, labels, focus states, empty states, error messages, and
   the most important tables.

**Exit:** A reviewer can explain the workflow, roles, and limits without reading
the implementation.

### 1. Secure access and actions (1 to 2 weeks)

1. **Implemented:** enforce role permissions on web and API routes. Continue
   exercising denied as well as allowed actions in the reviewed contracts.
2. **Implemented:** public signup creates a pending account; an Admin must
   approve it and assign a role before access is granted.
3. **Implemented:** CSRF protection for browser forms, production secure
   cookies, startup validation for database URLs/JWT secret/port/CORS origins,
   and browser security headers.
4. **Partially implemented:** limit web/API sign-in to 10 attempts per IP and
   public signup to 5 attempts per IP in a 15-minute window. The store is
   process-local; use a shared store/edge limit across multiple app instances.
   Account approval and deactivation/reactivation advance a token version so
   existing API and browser sessions stop working. Password change/recovery and
   version invalidation on credential changes remain open.
5. Add tests for anonymous, wrong role, expired session, forged form request,
   and valid actions for each role.

**Exit:** A signed in Sales user cannot adjust stock or record a payment unless
the matrix permits it, through either the page or the API. A forged form POST is
rejected. A disabled account cannot keep acting with an old token.

### 2. Make transactions safe under retries and concurrency (1 to 2 weeks)

1. **Implemented:** payment balance checks and writes share a transaction;
   invoice row locks serialize concurrent payments, and database constraints
   reject invalid core quantities and amounts.
2. **Implemented for core transitions:** confirmation, cancellation, invoicing,
   purchase receipt, stock changes, and payments recheck state under PostgreSQL
   row locks. Keep expanding race and rollback coverage.
3. **Partially implemented:** API payment recording accepts `Idempotency-Key`;
   identical retries return the existing invoice and a key reused with different
   payment details is rejected. Add equivalent protection for purchase receipt
   and other externally repeatable transitions.
4. Add reconciliation queries or tests: movement totals match current stock;
   reserved quantity never exceeds on hand; invoice payments never exceed total;
   each order follows an allowed state transition.
5. Test failed transactions and simultaneous requests against a disposable
   database. Preserve the existing historical price and cost snapshots.

**Exit:** Parallel requests cannot overpay an invoice, double receive a
purchase order, consume stock twice, or leave a partially applied workflow.

### 3. Make the app deployable and recoverable (1 to 2 weeks)

1. **Implemented:** local config/signup tests, typecheck/build, the companion
   reviewed Playwright contracts, and isolated PostgreSQL CI. Keep these gates
   passing as workflows change.
2. Prepare a staging environment with HTTPS, environment specific secrets,
   an automated deployment checklist, and migration step. For the current
   Prisma 5 setup, use `prisma migrate deploy` outside development. Test the
   PostgreSQL schema and migrations in staging before changing the production
   database; switching providers is more than changing one schema line.
3. **Partially implemented:** a readiness endpoint checks database access
   separately from liveness, and committed business events appear in the Admin
   activity log. Add structured request logs, request IDs, and error alerts.
   Exclude passwords, tokens, and sensitive business payloads from logs.
4. Automate database backups, document retention, and perform a restore drill.
   Write a one page runbook for failed deployment, failed migration, and recovery.
5. Track dependency updates and security advisories; review upgrades through
   the same CI gates.

**Exit:** A fresh staging instance can be deployed from the documented steps,
the core workflow passes, and a backup can be restored to a working instance.

### 4. Complete the existing business flow (2 to 4 weeks)

Build in this order, stopping when the portfolio story is complete:

1. **Partially implemented:** append-only audit events cover account, stock,
   sales, purchasing, invoice, and payment actions in a readable Admin activity
   log. Expand coverage to edits and reversals as those workflows are added.
2. **Stock reality:** partial purchase receipts, stock counts and adjustments,
   reorder points, and a reason for every correction. Add warehouses only when
   the single location flow is reliable.
3. **Sales reality:** partial fulfilment, returns and credit notes, due dates,
   and customer balance. Define their inventory and invoice effects first.
4. **Usability at volume:** server side search, filters, pagination, clearer
   validation errors, responsive tables, accessibility review, and realistic
   demo data.

**Exit:** A user can trace a purchase through stock, a sale, an invoice, a
payment, and a return while balances remain explainable.

### 5. Adjacent modules (optional, one at a time)

| Module | Smallest useful version | Depends on |
| --- | --- | --- |
| CRM | Lead, opportunity, and conversion to customer or sales order | Role rules and customer history |
| Replenishment | Low stock proposals that become draft purchase orders | Reorder points and reliable available stock |
| Approvals | Review queue for high value purchase orders or adjustments | Roles and audit trail |
| Reporting | Saved operational views and documented CSV exports | Metric definitions and pagination |
| Finance | Ledger, journals, tax, reconciliation, then statements | Explicit accounting model and expert review |

Do not start payroll, manufacturing, multi company, localization, or an AI
assistant merely for breadth. Each new module should reuse existing records and
complete a business task end to end.

## Portfolio presentation

Show a five minute demo of one purchase to payment journey and one recovery or
denied access case. Publish the architecture diagram, state transitions,
permission matrix, CI results, and the limits of the demo. A credible target is
roughly **9/10 as a portfolio project** after milestones 1 to 4. A narrow,
operated small business deployment might reach **6 to 7/10** after real usage,
monitoring, security review, and a restore drill. Neither score implies a
general enterprise ERP.

## Reference benchmarks

- [SAP Business One scope](https://www.sap.com/products/business-one.html) for
  the idea of connected small business workflows.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
  and [CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
  for security requirements.
- [Prisma migration deployment](https://docs.prisma.io/docs/cli/migrate/deploy)
  for the current migration command; verify the guidance for the installed
  Prisma version when upgrading.
