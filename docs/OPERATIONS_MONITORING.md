# Monitoring and incident runbook

Status: alert contract and response procedure documented; no external monitoring
provider is configured yet. Validate these thresholds with staging traffic before
using real business data.

## Signals already available

- `GET /health` checks process liveness.
- `GET /ready` checks process and PostgreSQL readiness, returning 503 when the
  database query fails.
- `X-ERP-Release` identifies the full deployed Git commit.
- Each request emits one JSON `http_request` event with request ID, method,
  route pattern, status, and duration. Query strings and request bodies are not
  logged.
- Unexpected server failures emit a JSON `application_error` event with the
  same request ID, route, error class, and a safe Prisma code when available.
  Exception messages, stack traces, tokens, request bodies, and record IDs are
  intentionally excluded.

Send stdout/stderr to the hosting provider's access-controlled log service. Use
30 days as the initial staging retention and restrict access to operators. Do
not enable indiscriminate request or database query logging.

## Initial alerts

| Alert | Starting condition | Severity |
| --- | --- | --- |
| Public availability | `/ready` fails twice in two minutes from an external region | Critical |
| Server errors | At least 5 HTTP 5xx responses in 5 minutes, or more than 2% with at least 20 requests | High |
| Repeated internal failure | Same `application_error.errorName` or safe database code occurs 3 times in 10 minutes | High |
| Slow requests | p95 `http_request.durationMs` exceeds 2 seconds for 10 minutes with at least 20 requests | Medium |
| Backup missing | Scheduled provider backup has no successful completion inside its promised window | Critical |
| Email delivery | 3 account-email delivery failures in 15 minutes | High |
| Release mismatch | External verification sees a different `X-ERP-Release` than the approved SHA | Critical |

Route alerts to one named primary operator and one backup contact. Test every
route in staging and record delivery time. Tune noisy thresholds from observed
staging traffic; never silence a critical alert without an owner and expiry.

## First response

1. Record alert time, release SHA, target, request IDs, and the person responding.
2. Check `/health`, `/ready`, recent deployment activity, database provider
   status, and the matching structured events. Avoid reproducing writes while
   stock or money integrity is uncertain.
3. If the issue began after a release, stop rollout and use the application
   rollback in [the staging deployment runbook](STAGING_DEPLOYMENT.md).
4. If data integrity may be affected, stop writes, run `npm run db:reconcile`
   read-only, and follow [the recovery runbook](OPERATIONS_RECOVERY.md). Do not
   seed, reset, or improvise corrective SQL.
5. Record customer impact, mitigation, evidence, and follow-up owner. Rotate any
   credential that may have been exposed through the incident itself.

## Specific runbooks

### Database unavailable

Confirm `/health` is up and `/ready` is 503. Check provider availability,
connection limits, and secret/version changes. Do not retry migrations blindly.
If a release changed the schema, compare migration status using the direct
connection and the approved release. Roll back the application only after
checking schema compatibility.

### Failed migration

Keep the new app version out of traffic. Preserve the migration output and
database branch. Determine whether the migration committed before retrying.
Prisma migrations are forward records; do not delete `_prisma_migrations` rows
or edit an applied migration. Use a clean staging branch to reproduce and use a
provider restore when data rollback is required.

### SMTP outage

Existing approved users can continue signing in, but signup verification and
password recovery are degraded. Confirm provider status and credentials without
printing them. Do not switch staging or production to console delivery. Record
delivery recovery with a synthetic account before resolving the incident.

### Suspected account compromise

Deactivate the affected account from an administrator session, which revokes
its sessions. Rotate relevant credentials, review the application audit log,
and preserve request IDs and timestamps. If an administrator or JWT secret is
affected, stop access while the secret is rotated and require fresh sign-in.

### Backup or restore alert

Treat a missing backup as a critical loss of recovery coverage even while the
site is healthy. Confirm provider retention and access controls, create a new
protected recovery point, and perform the documented isolated restore drill.
Do not mark the alert resolved from a successful CI restore smoke alone.

## Evidence needed before the monitoring gate passes

- external monitor target and account owner
- log destination, retention, and access list
- tested alert routes with delivery timestamps
- one simulated readiness failure and one simulated 5xx alert
- one rollback rehearsal tied to exact release SHAs
- one provider backup failure or missing-backup alert test
- dated reviewer sign-off and unresolved defects
