# Access control

The app has five roles. Access is checked on the server for both page actions and REST API mutations; hiding a button is not the security boundary. All signed-in users can view the operational pages and analytics, including the CSV export.

| Role | Allowed changes |
| --- | --- |
| Admin | All changes, payment recording, and user creation |
| Sales | Customers, sales orders, and invoice issuance |
| Purchasing | Suppliers and purchase orders, except stock receipt |
| Inventory | Products, manual stock additions, and purchase receipts |
| Staff | Read-only |

An Admin opens **Users** in the sidebar to add a user and assign a role. Public registration is disabled. Existing session and API tokens resolve the current role from the database on each request, so a removed user no longer has access. Unknown role values fall back to Staff.

Browser forms use CSRF tokens tied to the session and an HTTP-only cookie. Session and CSRF cookies are `Secure` when `NODE_ENV=production`; deploy behind HTTPS. API clients use Bearer tokens, not browser cookies. Keep `JWT_SECRET`, `DATABASE_URL`, and `DATABASE_URL_UNPOOLED` out of Git.

For a hosted database, set `ERP_SEED_ADMIN_PASSWORD` to a unique password of at least 12 characters before running `npm run db:seed`. The seed only creates the Admin when missing; it **does not reset** an existing Admin password. The local-only default is for a database on localhost.

This is an access-control foundation, not a production security sign-off. Before live business data: add password reset/change, user deactivation and role editing, login throttling, audit logs for sensitive actions, session revocation, backup/restore drills, and end-to-end authorization tests. Also review transaction concurrency and payment idempotency.
