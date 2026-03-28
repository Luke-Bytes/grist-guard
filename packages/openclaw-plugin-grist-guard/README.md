# OpenClaw Grist Guard Plugin

This native OpenClaw plugin exposes a narrow set of Grist broker tools. It only talks to the existing `grist-guard` HTTP broker and never writes to Grist directly.

## What It Does

- Lists broker-allowlisted documents
- Reads document schema
- Reads bounded table samples
- Creates add/update row plans
- Applies approved or auto-approved plans
- Reads plan, execution, and recovery status
- Ships one `grist-broker` skill for the plan-first workflow

## What It Does Not Do

- No direct Grist API access
- No generic broker passthrough tool
- No model-callable approval tool
- No schema mutation tools in v1

## Required Config

- `plugins.entries.grist-guard.config.baseUrl`
- `plugins.entries.grist-guard.env.GRIST_BROKER_TOKEN`
- Optional:
  - `sampleMaxRows`
  - `applyPollMs`
  - `applyTimeoutMs`
  - `healthcheckOnRegister`

## Install

Use a local path load or local path install. Preferred:

```bash
sudo -iu openclaw bash -lc 'openclaw plugins install /mnt/c/Users/Luke/Desktop/Enma/Projects/grist-guard/packages/openclaw-plugin-grist-guard'
```

Or point `plugins.load.paths` at:

```text
/mnt/c/Users/Luke/Desktop/Enma/Projects/grist-guard/packages/openclaw-plugin-grist-guard
```

## Tools

- Required read tools:
  - `grist_list_documents`
  - `grist_get_schema`
  - `grist_get_sample`
- Optional write tools:
  - `grist_plan_add_rows`
  - `grist_plan_update_rows`
  - `grist_get_plan`
  - `grist_apply_plan`
  - `grist_get_execution`
  - `grist_get_recovery`

## Approval Flow

1. Model reads schema and sample rows.
2. Model creates a plan.
3. Human checks `plan.id`, `warnings`, and `requiresApproval`.
4. Human approves with `openclaw grist-approve <planId>` when needed.
5. Model or operator applies the plan.
6. Success is only confirmed after execution status is returned.

## Troubleshooting

- `401`: wrong or missing `GRIST_BROKER_TOKEN`
- `403`: broker policy denied the document, table, or columns
- `409`: plan needs approval or the schema drifted
- `503`: broker or downstream Grist path is unavailable
- Plugin load failures: inspect `openclaw plugins inspect grist-guard --json`

## Security Model

- The broker remains the only AI write path.
- Human approval stays outside model-callable tools.
- Write tools are optional and require explicit allowlisting.
- The plugin uses typed, auditable broker calls only.
