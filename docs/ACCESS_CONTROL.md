# Access control

The app has five roles. Access is checked on the server for both page actions and REST API mutations; hiding a button is not the security boundary. All signed-in users can view the operational pages and analytics, including the CSV export.

| Role | Allowed changes |
| --- | --- |
| Admin | All changes, payment recording, and user creation |
| Sales | Customers, sales orders, and invoice issuance |
| Purchasing | Suppliers and purchase orders, except stock receipt |
| Inventory | Products, manual stock additions, and purchase receipts |
| Staff | Read-only |

New users can open **Create an account** from the login page. Their account starts as **Pending**, with no access to operational pages or API data. An Admin opens **Users** in the sidebar, reviews the request, and assigns one of the five roles. Admins can also add a user directly, deactivate/reactivate approved accounts, and cannot deactivate their own account or the last active Admin. Existing API tokens and browser sessions are checked against the user’s active flag and token version on each request. Deactivation, reactivation, and approval advance the token version so prior sessions stay revoked; pending users cannot retain access. Unknown role values fall back to Staff.

Admins can review recent, committed actions in **Activity log**. Account requests and approvals, master-record creation, stock changes, sales and purchase order transitions, invoices, and payments are written to the audit table in the same transaction as the business change. The log shows the latest 100 events. There is no application route to edit or delete events. This is an append-only application feature, not tamper-proof storage against database administrators.

Browser forms use CSRF tokens tied to the session and an HTTP-only cookie. Session and CSRF cookies are `Secure` when `NODE_ENV=production`; deploy behind HTTPS. The app validates its PostgreSQL URLs, minimum JWT secret length, port, exact CORS origins, and `TRUST_PROXY_HOPS` before listening. Set proxy hops only to the number of trusted proxies in front of the app; leave it at `0` when clients connect directly. Responses include a content security policy, frame protection, and restricted browser permissions; HSTS is enabled in production. API clients use Bearer tokens, not browser cookies. Keep `JWT_SECRET`, `DATABASE_URL`, and `DATABASE_URL_UNPOOLED` out of Git.

Sign-in defaults to 10 attempts per client IP per 15 minutes across web and API routes; public signup defaults to 5 per IP per 15 minutes. `AUTH_LOGIN_ATTEMPT_LIMIT` and `AUTH_SIGNUP_ATTEMPT_LIMIT` may be set from 1 to 1000 for controlled environments; keep production values conservative. The current limiter store is in process, bounded to 10,000 client keys, and resets when the process restarts. Use a shared store or edge gateway limit before running multiple app instances; this per-process control alone is not a distributed rate limit.

For a hosted database, set `ERP_SEED_ADMIN_PASSWORD` to a unique password of at least 12 characters before running `npm run db:seed`. The seed only creates the Admin when missing; it **does not reset** an existing Admin password. The local-only default is for a database on localhost.

This is an access-control foundation, not a production security sign-off. Before live business data: add email ownership verification for signup, password reset/change, role editing, shared rate limiting for multiple app instances, and backup/restore drills. The database now rejects invalid stock quantities, nonpositive payments, invalid line quantities, and negative prices/totals. The core order, receipt, invoice, stock, and payment paths recheck state under PostgreSQL row locks. API payment clients can supply an `Idempotency-Key`; matching retries return the existing result, while reusing a key with different payment details is rejected. Reviewed concurrency contracts cover the principal transitions, with broader end-to-end authorization and failure-recovery testing still needed.
