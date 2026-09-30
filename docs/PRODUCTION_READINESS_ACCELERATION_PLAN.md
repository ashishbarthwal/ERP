# Production readiness acceleration plan

Status: drafted 30 September 2026. This plan is for the mini-ERP's **business
deployment readiness** score. The separate personal-project score measures code
and portfolio quality and should not be used to imply that business data is safe.

## Current estimate

**3.2/10 for live business deployment.** This is a judgment call, not a test
result. The application has meaningful security, transaction, and workflow
coverage, but it has not yet demonstrated an operated production-like service.
The latest passing CI run includes concurrent manual-stock retry coverage and
the disposable PostgreSQL recovery/reconciliation gates. The additive stock
idempotency migration is applied to the development database. Those are useful
engineering proofs; they do not replace deployment, monitored operation, or a
restore drill using the chosen hosting and backup services.

## Fastest credible path

Plan on **five focused working days to reach about 5/10**, assuming hosting,
domain, SMTP, and backup-provider access are ready and no serious defects turn
up. Plan on **two to three weeks to reach about 6/10** and **four to eight weeks
to reach about 7/10**. These estimates assume one developer can spend most of
each workday on this plan. Waiting for provider access, review, or sustained
operating evidence extends the calendar time.

The fastest path is an evidence sprint. Do not spend it adding ERP modules,
rebranding pages, or chasing SAP feature parity. Use a separate staging
environment with synthetic data until the gates below are met.

### Day 1 — Make a production-like staging deployment

- Choose one hosting target and a separate staging database. Never point staging
  at the current development database or any real customer data.
- Deploy from a recorded commit through a repeatable build and migration step.
- Configure HTTPS, production-mode startup, secrets, SMTP delivery, and a
  restricted administrator account. Verify signup, email confirmation, login,
  role denial, logout, and password recovery on the deployed target.
- Record deployment and rollback steps, environment ownership, and the commit
  currently running.

**Gate to claim 4/10:** a second person can identify the exact staging revision,
and the deployed security and account flows work without development fallbacks.

### Day 2 — Prove backups can restore the service

- Select a backup location with encryption, access controls, retention, and
  deletion protection. Document who can restore and who can access the files.
- Schedule backups and alert on missing or failed runs. State a practical
  recovery point objective (RPO) and recovery time objective (RTO).
- Restore a recent backup into a clean isolated database; start the app against
  it; verify sign-in and one purchase-to-invoice workflow; record measured RPO,
  RTO, and any missing data.
- Keep the existing CI backup/restore smoke test. It checks code behavior, while
  this drill checks the actual provider and operating procedure.

**Gate to claim 5/10:** a dated restore record meets the stated RPO/RTO, and a
failed backup raises an alert.

### Day 3 — Add basic operational visibility

- Monitor external uptime and `/ready`; alert on repeated failures, elevated
  server errors, and database connection failures.
- Centralize application logs with retention and access controls. Confirm that
  passwords, tokens, request bodies, and personal data do not enter logs.
- Write short runbooks for deployment rollback, failed migrations, database
  restore, SMTP outage, suspected account compromise, and disabling access.
- Test each alert once and record who receives it and what action they take.

### Day 4 — Review the real risks and workflows

- Run dependency and configuration checks against the deployed candidate; fix
  high-severity findings before opening access.
- Review authorization, CSRF, rate limits, session revocation, account recovery,
  and audit history as a coherent set. Include API and browser paths.
- Walk through purchase order → receipt → sales order → reservation → invoice →
  payment, including denied roles and failed/duplicate requests.
- Complete a supervised keyboard and mobile review of the signed-in workflow.

### Day 5 — Rehearse and decide

- Repeat deploy, rollback, alert, and restore steps using the runbooks.
- Confirm reconciliation and business totals after the restore and workflow run.
- Record defects, owners, evidence links, and a go/no-go decision. Keep the
  environment on synthetic data if any recovery, access, or money/stock defect
  remains unresolved.

## Score gates after the first week

| Score | Evidence required |
| --- | --- |
| **4/10** | Production-like staging deployment; exact revision recorded; secure configuration, SMTP, account recovery, and role boundaries verified there. |
| **5/10** | 4/10 evidence plus monitored service and successful provider-level backup restore meeting documented RPO/RTO. |
| **6/10** | 5/10 evidence plus security review, alert/incident rehearsal, repeatable rollback, clean reconciliation, and an end-to-end business workflow on the deployed candidate. |
| **7/10** | 6/10 evidence plus a controlled low-risk pilot, several weeks of operating evidence, a second successful restore drill, and resolved high-severity findings. |

Scores are checkpoints, not certifications. A single unresolved critical access,
data-loss, or transaction defect blocks the next gate regardless of the numeric
average. Do not score an unrun activity as complete.

## Blockers and decisions to resolve first

1. Pick the staging/hosting provider and confirm who owns its account and alerts.
2. Provide a dedicated production-grade SMTP sender and domain configuration.
3. Pick a protected backup destination and retention period; the current CI
   restore check is not a hosted backup service.
4. Agree on RPO/RTO and the intended user count before the restore drill.
5. Keep the open GitHub PR reviewed and explicitly approved before merging or
   directing a deployment at its branch.

If any provider account or approval is unavailable, continue with deployment
scripts, runbooks, and review in the repository; do not substitute Neon
development data or claim the deployment gate passed.

## Next work queue

1. **Complete:** pass the concurrent manual-stock retry contract and pin the
   exact tested framework revision in the ERP workflow.
2. **Repository work complete:** build an immutable container, require exact
   release identity, and document staging deployment and rollback. CI still
   needs to validate the container on this revision.
3. Select a staging provider and document target isolation before deploying.
4. Configure scheduled backups and run the provider-level restore drill.
5. Add monitoring, alert tests, and incident runbooks.
6. Complete the supervised signed-in accessibility/usability review.

See the broader product scope and prior milestone history in [the roadmap](ROADMAP.md).
