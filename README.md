# Grist Guard Broker

Standalone broker service that mediates AI access to a Grist instance through typed actions, server-side validation, policy allowlists, durable plans, approvals, and audit history.

## What is implemented

- Read-only document/schema/sample endpoints
- Typed mutation planning for create table, add column, add rows, update rows, and formula proposals
- Approval-gated plan apply flow
- Pre-apply recovery marker capture using Grist snapshots/states metadata
- Per-document execution locking and bounded retry for transient Grist failures
- Authenticated metrics and readiness checks
- SQLite-backed persistence using Node's built-in `node:sqlite`
- Broker-owned auth, policy enforcement, idempotency, and audit events
- Grist client abstraction over documented high-level REST endpoints

## Quick start

1. Copy `.env.example` to `.env` or export equivalent environment variables.
2. Ensure the `data/` directory exists if using the default DB path.
3. Run `node src/index.js` or `npm start`.

## Authentication

Set `BROKER_AUTH_TOKENS` to a comma-separated list of broker bearer tokens. Send requests with:

```http
Authorization: Bearer <token>
```

## Document allowlist shapes

`BROKER_ALLOWED_DOCUMENTS_JSON` now supports:

- Full access to a document by ID only:

```json
{"yourDocId": true}
```

- Full access to multiple documents:

```json
["docA", "docB"]
```

- Wildcard tables or columns inside a restricted document:

```json
{
  "yourDocId": {
    "tables": {
      "*": {
        "read": true,
        "write": true,
        "allowedColumns": ["*"]
      }
    }
  }
}
```

- Mixed strict rules:

```json
{
  "yourDocId": {
    "tables": {
      "Tasks": {
        "read": true,
        "write": true,
        "allowedColumns": ["Title", "Status"]
      }
    }
  }
}
```

## Main endpoints

- `GET /health/live`
- `GET /health/ready`
- `GET /v1/metrics`
- `GET /v1/documents`
- `GET /v1/documents/:docId/schema`
- `GET /v1/documents/:docId/tables/:tableId/sample`
- `POST /v1/plans`
- `POST /v1/plans/:planId/approve`
- `POST /v1/plans/:planId/apply`
- `GET /v1/plans/:planId`
- `GET /v1/executions/:executionId`
- `GET /v1/executions/:executionId/recovery`
- `GET /v1/audit`

## Live verification

- `npm run test:live` runs the env-gated real Grist integration suite.
- `npm run smoke:live` performs a full HTTP broker smoke flow against a real Grist document.
- Required env vars for live checks:
  - `LIVE_GRIST_BASE_URL`
  - `LIVE_GRIST_API_KEY`
  - `LIVE_GRIST_DOC_ID`
  - `LIVE_GRIST_TABLE_ID`
  - `LIVE_TEST_ROW_JSON`

## Notes

- The broker intentionally does not expose raw Grist passthrough or low-level `/apply`.
- Destructive actions are disabled.
- Formula support is proposal-first and approval-gated.
- Recovery is operator-assisted: the broker stores pre-apply snapshot/state references but does not automate rollback.

## OpenClaw plugin

This repo also includes a native OpenClaw plugin source package at `packages/openclaw-plugin-grist-guard`.

- First-time installer: `scripts/install-openclaw-plugin.sh`
- Plugin README: `packages/openclaw-plugin-grist-guard/README.md`
- Operator runbook: `docs/openclaw-plugin.md`
