# Staging deployment and rollback

Status: repository procedure ready; no external staging target has been selected
or deployed yet. Use only a dedicated staging database containing synthetic data.

## Release contract

Every staging release must identify one full Git commit SHA. The application
requires `APP_RELEASE_SHA` in staging and production and returns it in the
`X-ERP-Release` response header. The container also records the commit in its
OCI image metadata when built with `VCS_REF`.

Required deployment secrets and settings:

- `NODE_ENV=staging`
- `APP_RELEASE_SHA=<full 40-character commit SHA>`
- `DATABASE_URL` for pooled application traffic
- `DATABASE_URL_UNPOOLED` for migrations
- `JWT_SECRET` with at least 32 characters
- `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, and `MAIL_FROM`
- `PUBLIC_APP_URL` using HTTPS
- `TRUST_PROXY_HOPS` matching the known hosting proxy chain
- optional exact `CORS_ORIGINS`; leave empty for the server-rendered site

Store values in the hosting provider's secret manager. Do not put them in the
container image, GitHub artifacts, command history, or this document.

## Build and inspect the immutable image

From a clean checkout of the reviewed revision:

```powershell
$releaseSha = git rev-parse HEAD
docker build --build-arg "VCS_REF=$releaseSha" --tag "mini-erp:$releaseSha" .
docker image inspect "mini-erp:$releaseSha" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

Push the image to the chosen private registry using the same SHA tag. Do not use
`latest` as the deployment record.

## Preflight and migrate

Run the release preflight inside the candidate image with the staging secret
environment attached. It validates configuration, exact revision identity,
compiled output, and migration history without printing secret values:

```powershell
docker run --rm --env-file <provider-managed-staging-env> "mini-erp:$releaseSha" npm run release:preflight -- $releaseSha
docker run --rm --env-file <provider-managed-staging-env> "mini-erp:$releaseSha" npm run prisma:migrate:deploy
```

Before migration, record the provider database branch, current migration status,
release SHA, operator, and time. Apply migrations once as an explicit release
step. Do not run `db:seed` during deployment.

## Deploy and verify

Deploy the SHA-tagged image with one instance first. Configure the platform's
readiness check to use `/ready`; `/health` only proves the process can respond.
Give the container at least 15 seconds to handle `SIGTERM`; the app stops
accepting requests, allows up to 10 seconds for active connections, and then
disconnects Prisma before the platform terminates it.
After the instance is ready:

```powershell
npm run release:verify -- "https://staging.example.com" $releaseSha
```

The command verifies HTTPS, liveness, database readiness, exact release
identity, security headers, and the secure CSRF cookie without signing in or
changing data. Then complete the supervised checks below:

1. Save the automated verification result in the release evidence record.
2. Sign in with the restricted staging administrator and verify logout.
3. Exercise email verification and password recovery through the staging SMTP
   sender. Confirm links point to the staging HTTPS origin.
4. Verify one denied role action and one synthetic purchase-to-payment workflow.
5. Run `npm run db:reconcile` against the staging database and record the result.

Keep the prior image SHA available until the verification record is approved.

## Application rollback

If readiness or verification fails, stop rollout traffic and redeploy the prior
known-good SHA-tagged image. Confirm its `X-ERP-Release` header and `/ready`
response, then repeat the read-only checks. Record the failure and rollback
times and preserve logs for investigation.

Prisma does not automatically reverse migrations. If the new release applied a
schema change, first determine whether the previous application remains
compatible with that schema. The current migration history is additive, but
compatibility must be reviewed for every release. If a migration damaged data
or prevents rollback, use the separately rehearsed restore procedure in
[the recovery runbook](OPERATIONS_RECOVERY.md); do not edit migration history or
run improvised destructive SQL.

## Evidence record

For every rehearsal or release, record:

- target name and database branch ID
- release and previous release SHAs
- container image digest
- migration status before and after
- `/health`, `/ready`, and `X-ERP-Release` results
- account/email/role/workflow checks performed
- reconciliation result
- deploy and rollback duration
- operator, reviewer, defects, and final decision

Completing this repository procedure alone does not satisfy the 4/10 gate. The
gate requires a real production-like staging deployment and recorded evidence.
