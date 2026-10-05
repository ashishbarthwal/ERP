# Database recovery runbook

Status: documented procedure; **not yet rehearsed against a staging restore**.
The CI dump/restore smoke uses an empty, disposable PostgreSQL service and is
not a backup of hosted business data. No production backup schedule or retention
policy is configured by this repository.

## Restore to a separate branch for investigation

1. Record the incident time, the last known good time, the affected release,
   and the person coordinating recovery. Pause the affected app deployment so
   it cannot add writes while the database is assessed.
2. In the database provider, confirm the project and source branch before
   choosing a supported restore point. Confirm the account's backup window and
   retention for that project; do not assume this repo configures either.
3. Restore into a **new branch**. Keep the source branch intact and do not
   finalize a replacement while the recovered copy is being checked. Neon
   supports restoring a snapshot to a new branch and a separate finalize step
   that reassigns computes and changes branch names; use the current provider
   console/API instructions for the actual operation ([restore snapshot](https://api-docs.neon.tech/reference/restoresnapshot),
   [finalize restore](https://api-docs.neon.tech/reference/finalizerestorebranch)).
4. Give the restored branch a restricted credential. Use its pooled URL for
   application traffic and its direct URL for migration checks. Keep the URLs
   in a temporary, access-controlled environment; never copy them into chat,
   logs, artifacts, or Git.
5. Before starting an app, check that the restored schema and
   `_prisma_migrations` history are coherent with the release being evaluated.
   Do not run `prisma migrate deploy` against the source branch as a recovery
   step. Any migration applied during verification must target only the new
   restore branch and be recorded in the incident log.
6. Validate the candidate using read-only checks first: database readiness,
   expected migration history, a small set of recent business records, stock
   quantities, order/invoice relationships, and payment totals against the
   incident's known-good evidence. Do not run `db:seed` or the write-heavy
   Playwright suite against a copy that contains business data. If tests need
   writes, make a separate disposable copy and use synthetic accounts/data.
7. Record the restore point, provider branch ID, migration result, checks run,
   and discrepancies. If checks fail, leave the source untouched and discard
   or isolate the candidate according to provider policy.

## Cutover after an approved restore

1. Obtain the application's data owner approval for the selected restore point
   and the expected loss window. Confirm a current recoverable point still
   exists for the original branch.
2. Schedule downtime and prevent writes. Update both
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in the deployment's secret store
   to the verified candidate branch. Keep all other production secrets in the
   secret store; do not run commands with connection strings embedded in their
   visible arguments or console output.
3. Deploy the reviewed application version and check `prisma migrate status`
   against the candidate before applying any pending migration. Run migrations
   only when the release procedure explicitly includes them.
4. Start the app, verify `/health` and `/ready`, and perform the approved
   read-only business checks. Record the deployment version, branch IDs, and
   result. Keep the original branch available and isolated until the owner
   confirms recovery and rollback is no longer needed.
5. If the candidate fails, stop the app and restore its previous database
   environment. Do not delete or overwrite either branch as part of an
   unreviewed retry.

## Readiness still required

Choose and document the production backup frequency, retention, access controls,
alerting, recovery-time objective, and recovery-point objective with the actual
provider account. Then rehearse this procedure in staging from a real provider
restore point, including the deployment cutover and rollback. The CI restore
smoke does not satisfy that rehearsal.
