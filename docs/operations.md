# Operations

## Preflight

1. Verify the Grist API key belongs to the intended local operator account.
2. Verify `BROKER_ALLOWED_DOCUMENTS_JSON` contains only the intended doc/table allowlist.
3. Run `npm test`.
4. Run `npm run smoke:live` with the dedicated live-test document before first production use.
5. Confirm `/health/ready` is healthy and `/v1/metrics` shows successful probes.

## Recovery workflow

1. Look up the execution with `GET /v1/executions/:executionId`.
2. Retrieve the recovery marker with `GET /v1/executions/:executionId/recovery`.
3. Use the recorded `latestSnapshot` or `latestState` to locate the matching Grist document history point.
4. Restore manually through Grist document history or save a copy before replacing the live version.
5. Record the manual restore action in your operator notes because the broker does not automate rollback in this phase.

## Retention

- Preview retention cleanup with `npm run retention:dry-run`.
- Run the real prune command by invoking `node scripts/prune-retention.js`.
- Default retention is controlled by `BROKER_RETENTION_DAYS`.

## Upgrade

1. Take a filesystem copy of the broker SQLite file.
2. Pull the new broker version into a staging path or branch.
3. Run `npm test`.
4. Restart via `pm2 restart grist-guard-broker`.
5. Re-check `/health/ready` and one live read endpoint.
