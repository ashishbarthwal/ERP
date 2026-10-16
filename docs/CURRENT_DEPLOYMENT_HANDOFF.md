# Mini-ERP deployment handoff - 2026-10-06 (Asia/Calcutta)

Read this first when continuing the Render deployment, signup, or database-access work.
This handoff distinguishes live checks from local and CI checks. Never print credentials
or copy external environment files into Git. Recheck repository status before editing.

## Current outcome

- Live site: https://erp-18aw.onrender.com ; login: /login.
- Render service ID: `srv-db1tp6s9v7es7394ou6g`; display name was ERP.
  LedgerNest Demo was suggested, but a rename was not verified.
- Render Free, Docker runtime, repository root blank; region Oregon.
- Fresh handoff check: `/ready` returned HTTP 200 with `{"status":"ready"}`.
  HTTPS response had HSTS and `x-erp-release: 1c17619e70e1fd8eaff16f87601c368584f4bb83`.
- Earlier full hosted `npm run release:verify` passed for that reported release.
  The release header comes from a manually pinned environment value, so it does
  not prove whether Render has built later CI-only commits. Check Render's actual
  deployment commit before claiming a newer release is live.
- Admin credentials are saved privately outside the repository. Admin login was
  tested against the real Neon database locally; the user reached the hosted login
  page. A complete hosted authenticated business-workflow smoke was not recorded.

## Repository and CI state

- ERP: `D:\Downloads\PJs\Smart Automation Framework\dev\mini-erp`.
- Public MIT repository: https://github.com/ashishbarthwal/ERP .
- Default/release branch: `ui/full-site-polish-2026-09-29`.
- Latest pushed commit before this documentation:
  `712854ca65d29e7965619a1e1e3a32924d818e43`.
- Runtime/demo feature commit: `1c17619e70e1fd8eaff16f87601c368584f4bb83`.
- Both the PR run and full manual CI run passed after the access fix:
  https://github.com/ashishbarthwal/ERP/actions/runs/37355734500
  https://github.com/ashishbarthwal/ERP/actions/runs/37355725658
- Full run: Docker build, framework checks, ERP checks, 18 reviewed contracts,
  artifact uploads, 9/9 reconciliation, and PostgreSQL backup/restore passed.
  The contract runner still reports a review queue; green CI is not complete
  coverage of every application change.
- CI triggers on `main` and the release branch. It uses a disposable PostgreSQL
  service, never the hosted Neon demo database.
- Original failure: public ERP could not download the private framework action.
  CI now checks out the framework separately using the Actions secret
  `ERP_CONTRACT_RUNNER_SSH_KEY`, a read-only deploy key scoped to that repository.
  Checkout has `persist-credentials: false`; fork PRs skip the secret-bearing job.
- Second failure: local action paths included `/./`, rejected by artifact upload.
  The framework action now resolves its artifact root using `realpath`.
- Framework remains private and separate:
  `D:\Downloads\PJs\Smart Automation Framework\test`, branch
  `ui/erp-full-site-audit-2026-09-29`, pinned commit
  `fee2389edbf21d5c41eebec93da7857f1027a024`.
- Preserve unrelated dirty framework changes: `.github/agents/playwright-test-healer.agent.md`,
  `README.md`, `package.json`, and untracked product/proposal docs/scripts.
  Do not reset, clean, publish the framework, or merge repositories.
- This handoff is a local documentation change, not yet committed/pushed.

## Database

- Neon Free project `mini-erp-demo`, ID `solitary-haze-33512459`.
- Main branch ID `br-mute-breeze-azdec210`; region AWS Singapore; PostgreSQL 18.
- Console: https://console.neon.tech/app/projects/solitary-haze-33512459/settings .
- All 12 migrations were applied to this dedicated demo target.
- After verifying endpoint identity and an empty database, a strong initial admin
  and synthetic customer/product/supplier were seeded. Reconciliation passed 9/9.
  Do not rerun the bootstrap or reset/seed the live database.

## Runtime configuration and private local files

Files live in `C:\Users\ASHISH\AppData\Local\mini-erp-deploy` (outside Git):

- `render-import.env`: complete validated config imported into Render.
- `render-import.draft.env`: same usable demo config, despite the draft filename.
- `render-import.draft.smtp-backup.env`: old incomplete SMTP setup; do not import.
- `render-demo.env`: original credential source; not the current import file.
- `ledgernest-login.txt`: initial admin email/password; use only for site login.
  The email is `admin@mini-erp.test`; never put the password in app env or Git.
  Whether the user has since changed that password was not verified.
- `prepare-render-demo.cjs`: builds/validates filled disabled-mail import files
  from stored credentials and current Git SHA. Do not run just to refresh CI docs:
  it pins the current SHA, which must match the intended Render deployment.
- `prepare-render-env.cjs`: older SMTP helper; do not run until configuring real
  SMTP credentials, since it may overwrite the usable demo draft.
- `check-demo-db.cjs`: explicit-target read-only migration/reconciliation check.
- `bootstrap-demo.cjs`: already run; do not rerun.
- `smoke-render-demo.cjs`: local real-database staging startup/auth smoke.
- `erp-ci-contract-runner-ed25519` and matching deploy-key metadata: private CI
  access material; never share as database credentials or commit it.
- No Render API key was found. Both browser-control mechanisms were unavailable;
  the user performed Render dashboard changes manually.

Current runtime: `NODE_ENV=staging`, `MAIL_MODE=disabled`, `TRUST_PROXY_HOPS=0`,
empty `CORS_ORIGINS` for same-origin use, login/signup limits 10/5. Actual pooled
and direct PostgreSQL URLs and JWT secret are in the private import file.
Let Render supply `PORT`. Health-check setting should be `/ready`; actual Render
setting has not been read back. Client-IP/proxy attribution remains unverified.

## Accounts and email: unfinished setup

- The live deployment uses staging demo mode. Public signup, email verification,
  and password recovery are deliberately unavailable. Production refuses this mode.
- More users can be created now by the admin at `/register`; users/roles at `/users`.
- Existing public signup flow creates a PENDING account, sends verification, then
  requires admin approval and a role assignment before login.
- All users share this ERP workspace; independent per-customer workspaces are
  not implemented.
- Fastest existing self-service path: activate Brevo transactional sending,
  verify a sender, obtain the actual SMTP login/key, then set `MAIL_MODE=smtp`,
  `MAIL_HOST=smtp-relay.brevo.com`, `MAIL_PORT=2525`, `MAIL_USER`,
  `MAIL_PASSWORD`, `MAIL_FROM`, and
  `PUBLIC_APP_URL=https://erp-18aw.onrender.com` in Render.
- For dependable delivery, authenticate a sender domain the user owns.
  Gmail/Yahoo domains cannot be authenticated. Provider activation and hosted
  delivery have not been completed or tested. Never invent SMTP credentials.
- Render docs block outbound SMTP 25/465/587 on Free; Brevo supports 2525.
  Test hosted delivery before promising it works. HTTPS API is a fallback only
  if SMTP fails; no Brevo API transport currently exists in the app.
- Test signup -> delivered verification -> admin approval -> login and password
  recovery after enabling SMTP. No migration or app rewrite is required for the
  existing shared-workspace approval flow.

## Friend's database access: current task

- Friend has GitHub access; database/Neon access is separate.
- User opened organization `org-winter-dream-48918011` in Neon.
- Invite via organization **People**, using org role **Collaborator**; after the
  invitation is accepted, grant **Editor** only on `mini-erp-demo` under project
  Settings -> Project permissions.
- Invitation acceptance and project grant were not confirmed.
- Editor exposes connection strings and permits project changes; Viewer only
  sees metadata/settings, not connection strings. For strictly read-only SQL,
  create a separate restricted PostgreSQL login instead. Do not share the app's
  owner password as the default solution. Friend's needed access level is unclear.
- User asked generally about **Connect to GitHub** in Neon. It is optional PR
  database branching, not needed for friend access or current CI. Leave off until
  preview deployments need it; no integration or new Neon API key was created.

## Resume checklist

1. Read this file; verify nested repo statuses and current Render deployment SHA.
2. Follow the user's next objective: friend access, SMTP/signup, or development.
3. Preserve private credentials and unrelated local changes; never run destructive
   test/seed/migration operations against the hosted demo by assumption.
4. For deployment verification use `npm run release:verify -- <origin> <full-sha>`
   with the actual intended release, allowing Free-instance wake-up time.

Provider references:
- https://render.com/docs/free
- https://render.com/docs/environment-variables
- https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP
- https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email
- https://neon.com/blog/neon-now-has-per-project-permissions
