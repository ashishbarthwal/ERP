# Free mini-ERP deployment: Render + Neon + Brevo

Verified against provider documentation and the local checkout on **2026-10-04**.
Target: a personal ERP demo with synthetic records, using Render Free for the
existing Docker application, Neon Free for PostgreSQL, and Brevo Free for email.
This is a deployment procedure, not evidence of a completed hosted deployment.

## Fastest personal demo: deploy without an email provider

Use the existing Render Free service and migrated Neon database. Set
`NODE_ENV=staging` and `MAIL_MODE=disabled`, plus the real database URLs,
JWT secret, and release identity. SMTP credentials and `PUBLIC_APP_URL` are
not required by this mode. It rejects public signup, email verification, and
password recovery before account/token writes, and displays their unavailability
on the login page. Existing administrator sign-in, administrator-created users,
and authenticated ERP operations remain available. Secure staging cookies,
CSRF protection, rate limiting, and `/ready` stay enabled. Production rejects
disabled email mode.

Apply the filled local `render-import.env` in Render, keep Free selected and
the health path `/ready`, save environment changes, then manually deploy the
latest commit. Sign in with the separately saved demo administrator credentials.
For working signup and email recovery later, change `MAIL_MODE` to `smtp`,
configure all real Brevo settings, use the actual HTTPS origin, and test delivery.

## What verification established

| Item | Confirmed fact / remaining check |
| --- | --- |
| Neon Free | **1 GB of database storage per project**, increased from 0.5 GB on 2026-10-02; existing projects receive the increase automatically. Includes 100 CU-hours per project per month. [Announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project). |
| Render Free | Sleeps after 15 minutes without inbound traffic; waking takes about one minute. Includes 750 instance hours shared by the workspace each month. Storage inside the container is ephemeral. [Limits](https://render.com/docs/free). |
| Database choice | Use Neon. Render's free PostgreSQL expires after 30 days. [Render limits](https://render.com/docs/free). |
| Migration step | Render pre-deploy commands require paid services. Apply migrations separately from the exact release checkout before serving that release. [Deploy steps](https://render.com/docs/deploys). |
| Email quota | Brevo Free includes 300 sends per day. Account activation and sender setup still need completing. [Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan). |
| Email transport | Render documents blocking outbound ports 25, 465, and 587. Brevo supports **2525**. Our Nodemailer configuration already requests STARTTLS on ports other than 465. Port 2525 is a candidate compatible with the current code; successful TLS negotiation and delivery **from Render have not been tested**. [Render restrictions](https://render.com/docs/free), [Brevo SMTP](https://developers.brevo.com/docs/smtp-integration). |
| API fallback | Earlier chat instructions overstated the need to implement Brevo's HTTPS API before trying deployment. Try SMTP 2525 first. If it fails on the hosted service, the API is a fallback that requires implementation and tests; the current app has no Brevo API-key configuration. [API documentation](https://developers.brevo.com/docs/send-a-transactional-email). |

Keep all three accounts on their free plans. For Render, without a payment method,
bandwidth overages suspend free services and build-minute overages disable new
builds rather than charging you. Account approval and provider quotas still apply.
Use Render's supplied HTTPS address; a website domain purchase is unnecessary.

## 1. Prepare accounts and an isolated database

1. Sign into Render and connect the GitHub account with access to
   `ashishbarthwal/ERP`. The local repository is `dev/mini-erp`; the workspace
   root is not the application repository.
2. In Neon, create a dedicated empty **demo project** (preferred) or a branch
   that you have confirmed contains only disposable records. A branch created
   from an existing branch may copy its data; it is not automatically empty.
3. From Neon's **Connect** dialog, copy the pooled and direct PostgreSQL URLs
   for that same database. Keep SSL enabled. Use the pooled URL for application
   traffic and the direct URL for migration commands. See
   [POSTGRES_MIGRATION.md](POSTGRES_MIGRATION.md).
4. In Brevo, select Free, complete transactional-account activation, and configure
   a verified sender. Authenticate an existing sender domain if available;
   confirm what the account accepts before assuming a free-mailbox sender will
   work. See [sender setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
5. Obtain the **SMTP login and SMTP key**, not the Brevo website password or API
   key. These will populate `MAIL_USER` and `MAIL_PASSWORD`.

## 2. Prepare the complete release in Git

Run from `D:\Downloads\PJs\Smart Automation Framework\dev\mini-erp`:

```powershell
git status --short --branch
git remote -v
npm run typecheck
npm run build
```

At this verification, the branch is `ui/full-site-polish-2026-09-29` and the
checkout contains uncommitted application changes and three untracked migrations:

- `20261001090000_partial_purchase_receipts`
- `20261001100000_product_reorder_points`
- `20261001110000_invoice_due_dates`

Review the application/schema/migration changes together, exercise the relevant
existing tests on an isolated PostgreSQL target, then commit and push the intended
release to the ERP repository. Select that branch in Render; do not assume `main`
contains these changes. Include all migration directories. Exclude credentials.

Capture the full release identity after the release commit:

```powershell
$releaseSha = git rev-parse HEAD
```

Use that exact SHA for local preflight, the deployment, and verification.
On Render, `npm start` now fills an unset `APP_RELEASE_SHA` from
`RENDER_GIT_COMMIT` and an unset `PUBLIC_APP_URL` from `RENDER_EXTERNAL_URL`.
Explicit application values take precedence, including invalid ones: remove old
placeholders or frozen release values from Render to use these defaults.
Disable automatic deployment initially to keep migrations and the selected
release aligned. [Provider defaults](https://render.com/docs/environment-variables).

## 3. Configure Render

Choose **New > Web Service**, connect the ERP repository, and set:

| Setting | Value |
| --- | --- |
| Repository | `ashishbarthwal/ERP` |
| Branch | Branch containing the prepared release commit |
| Runtime / Language | Docker |
| Root directory | Leave blank; this repository already contains the app |
| Dockerfile path | `./Dockerfile` |
| Docker build context | Repository root (`.`), if shown |
| Instance type | Free |
| Docker Command override | Leave blank; the Dockerfile runs `npm start` |
| Health check path | `/ready` |
| Auto-deploy | Off for the first deployment and manual release procedure |
| Region | Prefer a region close to the selected Neon database |

Docker services do not use a separate build command; the Dockerfile performs
`npm ci`, TypeScript compilation, view copying, and dependency pruning. Keep the
default shutdown grace period, which exceeds the app's 10-second drain window.
See [Docker deployment](https://render.com/docs/docker).

Record the actual service HTTPS URL shown by Render. Leave `PUBLIC_APP_URL` unset
to use Render's supplied HTTPS origin automatically. If using a custom domain,
set an explicit HTTPS origin instead. The dashboard's service name is a label;
always use the actual URL shown by Render rather than guessing it from a rename.
If creation triggers an initial deploy before all settings are ready, correct
them and deploy the selected release again.

## 4. Set environment variables and secrets

Add these in Render's environment settings, without committing their values:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `staging` for the initial demo; secure cookies and transport headers are enabled |
| `APP_RELEASE_SHA` | Leave unset on Render; `npm start` maps the actual `RENDER_GIT_COMMIT`. Set the exact SHA in the local migration/preflight file. |
| `DATABASE_URL` | Neon pooled URL for the dedicated demo database |
| `DATABASE_URL_UNPOOLED` | Neon direct URL for the same database |
| `JWT_SECRET` | Fresh randomly generated secret, at least 32 characters |
| `MAIL_MODE` | `disabled` for the initial staging demo, or `smtp` for full mail workflows; production requires SMTP. |
| `PUBLIC_APP_URL` | Leave unset on Render to use `RENDER_EXTERNAL_URL`; set an explicit HTTPS origin only for a custom domain. Set the actual URL in the local preflight file. |
| `MAIL_HOST` | `smtp-relay.brevo.com` |
| `MAIL_PORT` | `2525` |
| `MAIL_USER` | SMTP login copied from Brevo |
| `MAIL_PASSWORD` | Brevo SMTP key |
| `MAIL_FROM` | Approved sender email address; current validation expects the plain address |
| `TRUST_PROXY_HOPS` | Number of trusted proxy hops, confirmed for the actual Render route; see below |
| `CORS_ORIGINS` | Empty for this same-origin server-rendered application |
| `AUTH_LOGIN_ATTEMPT_LIMIT` | Optional; default 10 |
| `AUTH_SIGNUP_ATTEMPT_LIMIT` | Optional; default 5 |

Let Render supply `PORT`; the app reads it and does not require port 4000 on the
host. `npm start` resolves the provider identity defaults before spawning the
server, so both startup validation and subsequent email links use the same URL.
Both PostgreSQL URLs and the JWT secret are validated at startup. All mail
settings and the HTTPS origin are also required except in explicitly disabled
staging demo mode. SMTP credentials being nonempty does not
prove account activation, sender acceptance, or delivery. See
[Render environment variables](https://render.com/docs/environment-variables).

`TRUST_PROXY_HOPS` is an environment-specific verification item, not a verified
constant in this guide. The app defaults to 0; behind a proxy this can group all
visitors under one rate-limit identity. Confirm the effective client address and
header handling before public signup. Do not blindly trust all forwarded headers
or assume 1 hop without checking the actual route. See
[Express proxy configuration](https://expressjs.com/en/guide/behind-proxies/).

Use a password manager to generate the JWT secret. Keep deployment credentials
in a separate local file **outside the repository**, for example:
`$env:LOCALAPPDATA\mini-erp-deploy\render-demo.env`. Populate it securely with the
same deployment values. The current `.gitignore` ignores `.env` only, not every
`.env.*` filename; do not place a `render-demo.env` or `.env.render-demo` in the
checkout assuming it is ignored. Do not copy credentials into chat or logs.

## 5. Validate and migrate from the release checkout

These commands require Node.js 24, installed dependencies, and the successful
build from step 2. The external environment file must exist and be populated.
Use a fresh terminal without inherited ERP/database settings: existing process
environment variables take precedence over Node's `--env-file` values.

```powershell
$deployEnvPath = Join-Path $env:LOCALAPPDATA 'mini-erp-deploy/render-demo.env'
$releaseSha = git rev-parse HEAD
node --env-file="$deployEnvPath" scripts/release/preflight.cjs $releaseSha
```

Before any write, confirm the actual target without printing credentials:

```powershell
node --env-file="$deployEnvPath" -e "for (const k of ['DATABASE_URL','DATABASE_URL_UNPOOLED']) { const u=new URL(process.env[k]); console.log(k+': '+u.hostname+u.pathname); }"
node --env-file="$deployEnvPath" node_modules/prisma/build/index.js migrate status
```

Confirm those endpoints match the dedicated demo database in Neon. A pending
migration status before first deployment is expected; a connection or migration
failure requires investigation. For an existing database, establish a recoverable
backup/restore point before schema changes. Then apply the release migrations:

```powershell
node --env-file="$deployEnvPath" node_modules/prisma/build/index.js migrate deploy
node --env-file="$deployEnvPath" node_modules/prisma/build/index.js migrate status
```

This invokes the same Prisma operation as `npm run prisma:migrate:deploy` while
explicitly loading the external deployment environment. Stop on any failure.
Do not run `prisma migrate dev` or a reset against the hosted target. Do not put
migration commands in the Docker build, and do not seed on every startup.

### Initial administrator and optional synthetic records

The current seed creates `admin@mini-erp.test`, a customer, a product with stock,
and a supplier. It is a demo seed, not a real-email administrator bootstrap.
It requires `ERP_SEED_ADMIN_PASSWORD` of at least 12 characters for hosted
databases. Existing admin records are not overwritten, so rerunning it does not
reset an existing password.

For the confirmed empty synthetic database only, set a fresh seed password in
the external environment file and optionally run once:

```powershell
node --env-file="$deployEnvPath" node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

Remove the seed password from the file after bootstrap; do not add it to Render.
For a custom initial admin without demo records, prepare a separate administrator
bootstrap instead of assuming the current seed supports arbitrary email/name
variables. Use a real mailbox test account for verification and recovery checks;
`admin@mini-erp.test` cannot receive external email.

## 6. Deploy and verify the hosted service

Trigger the manual deploy for the selected release commit. Confirm the Render
commit matches `APP_RELEASE_SHA`. Check startup logs and the `/ready` health check.
Never switch to `development` to bypass missing mail or release settings.

Open the service first and wait for the free instance to wake. The verification
script has a 10-second request timeout, shorter than Render's documented cold
start, so run it only after the service responds:

```powershell
$deploymentUrl = 'https://YOUR-SERVICE.onrender.com'
npm run release:verify -- $deploymentUrl $releaseSha
```

The existing script verifies `/health`, `/ready`, `/login`, exact release headers,
security headers, and a secure CSRF cookie. It does not prove full schema
compatibility, client-IP/proxy correctness, email delivery, or business workflows.

Complete these checks with synthetic records:

1. Sign in, open the dashboard, and sign out.
2. Submit a signup with a real test mailbox. Verify delivery through Brevo on
   port 2525 and confirm the link uses the actual Render HTTPS origin.
3. Complete the approval/role flow, then test password recovery for an active
   verified test account. Signup creates a pending account, not an administrator.
4. Confirm client-IP attribution and a denied role action.
5. Complete a purchase receipt, sales confirmation, invoice, and payment flow.
6. Run the read-only reconciliation command against the same demo database:

```powershell
node --env-file="$deployEnvPath" scripts/db/reconcile.cjs
```

If SMTP delivery fails, inspect Render and Brevo delivery status. Confirm account
activation, SMTP credentials, sender acceptance, and TLS/network reachability.
Do not disable TLS or account verification. If the hosted route cannot use 2525,
implement and test the Brevo HTTPS API fallback before calling email operational.
Setting an API key alone will not enable it in the current code.

Save the deployment URL, exact SHA, test results, database identity, and date in
a release record without passwords, action tokens, or connection strings.

## 7. Subsequent releases and rollback

For each release, review and test changes, commit/push, update the local preflight SHA,
apply the exact release migrations separately, manually deploy that commit, and
repeat verification. The Dockerfile's OCI revision label also needs `VCS_REF` as
a build argument if it is used as release evidence; its default is `unknown`.
The application header remains the runtime identity checked by the verifier.

Keep the previous working commit available. Rolling back application code does
not reverse PostgreSQL migrations: check compatibility first and use the
[staging runbook](STAGING_DEPLOYMENT.md) and
[recovery procedure](OPERATIONS_RECOVERY.md) if schema/data recovery is needed.
Render Free retains only the two most recent deploys for its rollback feature.

## Verification boundary

At the original 2026-10-04 research checkpoint, provider limits and procedures, Docker/package configuration, environment
validation, email code, migration inventory, seed behavior, and release scripts
were inspected. No Render/Brevo account was configured, no hosted SMTP delivery
was attempted, and no database migration or seed was executed for this guide.
`npm run typecheck` and `npm run build` passed on this checkout during verification;
these are static/build checks, not hosted or database-backed workflow evidence.
Proxy-hop count, account acceptance, migration runtime, and hosted workflow results
remain deployment checks. This free setup is for the personal demo; it is not a
live-business readiness sign-off.

## Deployment checkpoint: 2026-10-05

- Suggested Render display name: **LedgerNest Demo**. Keep using the actual
  service URL assigned by Render, regardless of its display name.
- Release branch: `ui/full-site-polish-2026-09-29`. Deploy its latest commit to
  include the `npm start` mapping of Render's URL and Git SHA defaults.
- Remove the manual `PUBLIC_APP_URL` and `APP_RELEASE_SHA` entries from Render
  to use the provider defaults. Explicit placeholders are not ignored.
- Runtime keys to import: `NODE_ENV`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  `JWT_SECRET`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`,
  `MAIL_FROM`, `TRUST_PROXY_HOPS`, `CORS_ORIGINS`, `AUTH_LOGIN_ATTEMPT_LIMIT`,
  and `AUTH_SIGNUP_ATTEMPT_LIMIT`. Let Render set `PORT`. Keep Render API keys
  and one-time seed passwords out of the application runtime environment.
- Build, typecheck, 19 app tests, and 9 operations tests passed locally after
  adding the provider-default mapping. It preserves explicit custom settings
  and still rejects missing or invalid deployment configuration.
- The dedicated Neon demo project was migrated successfully. Read-only
  reconciliation passed all 9 checks. The empty target was verified against
  the project's endpoint before creating the initial administrator and
  synthetic demo records. The administrator credentials are saved outside
  the repository in `%LOCALAPPDATA%\mini-erp-deploy\ledgernest-login.txt`.
- After the ERP repository became public, GitHub could not resolve the private
  test-framework action. CI now checks out the separate framework at reviewed
  commit `fee2389edbf21d5c41eebec93da7857f1027a024` and invokes it as a local action.
  Access uses a read-only deploy key for that framework repository, stored as
  the ERP Actions secret `ERP_CONTRACT_RUNNER_SSH_KEY`; checkout does not persist
  credentials. Fork pull requests cannot run this secret-bearing job. Both
  `main` and the Render release branch trigger CI. No personal token or hosted
  application/database credentials are required by the CI PostgreSQL target.
  To rotate access, replace the framework deploy key and the matching ERP
  secret. Do not commit the private key or publish the separate framework.
- For SMTP-enabled deployment, login/key and a verified sender must be populated with real values.
  An external preparation helper audits every required field and writes a
  Render import file only when all startup checks pass; it never logs secrets.
  Hosted SMTP delivery, proxy attribution, `/ready`, release identity, and
  authenticated workflows still require verification after a successful deploy.
- A later demo-only option, `MAIL_MODE=disabled`, removes the SMTP prerequisite
  while blocking all email-dependent account operations. Build, typecheck,
  22 app tests, and 9 operations tests passed with this option added. It does
  not provide signup or email recovery until SMTP is configured and enabled.
- To apply the new startup code with the corrected environment, save the
  environment changes without deploying, then use **Manual Deploy > Deploy
  latest commit**. A restart of the old image will not include the new mapping.
