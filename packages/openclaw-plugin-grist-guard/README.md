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
- `GRIST_BROKER_TOKEN` in `/home/openclaw/.openclaw/.env`
- Optional:
  - `sampleMaxRows`
  - `applyPollMs`
  - `applyTimeoutMs`
  - `healthcheckOnRegister`

## Install

Supported operator install:

```bash
sudo ./scripts/install-openclaw-plugin.sh --base-url http://127.0.0.1:8787
```

The installer builds the plugin from the repo checkout when needed, stages it into `/opt/grist-guard/openclaw-plugin-grist-guard`, installs it as a linked extension for `openclaw`, prompts for `GRIST_BROKER_TOKEN`, writes `/home/openclaw/.openclaw/.env`, merges `/home/openclaw/.openclaw/openclaw.json`, adds `grist-guard` to the existing global tool allow policy, restarts `openclaw-gateway.service`, and verifies the plugin load.

Non-interactive example:

```bash
sudo GRIST_BROKER_TOKEN=replace-with-broker-token \
  ./scripts/install-openclaw-plugin.sh \
  --base-url http://127.0.0.1:8787
```

If you need to do it by hand, the supported package install is:

```bash
sudo install -d -o root -g root /opt/grist-guard
sudo rm -rf /opt/grist-guard/openclaw-plugin-grist-guard
cd ./packages/openclaw-plugin-grist-guard && npm ci && npm run build && cd ../..
sudo cp -a ./packages/openclaw-plugin-grist-guard /opt/grist-guard/openclaw-plugin-grist-guard
sudo chown -R root:root /opt/grist-guard/openclaw-plugin-grist-guard
sudo -iu openclaw bash -lc 'openclaw plugins install --link /opt/grist-guard/openclaw-plugin-grist-guard'
```

## Contributor Install

For local development only, use a linked install instead of `plugins.load.paths`:

```bash
sudo -iu openclaw bash -lc 'openclaw plugins install --link /opt/grist-guard/openclaw-plugin-grist-guard'
```

The linked path must be owned by `openclaw` or `root`. Do not combine a linked install with `plugins.load.paths` for the same plugin id.

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
- Startup warning with missing config: install succeeded, but the plugin stays inactive until `baseUrl` and `GRIST_BROKER_TOKEN` are configured
- Plugin load failures: inspect `openclaw plugins inspect grist-guard --json`

## Security Model

- The broker remains the only AI write path.
- Human approval stays outside model-callable tools.
- Write tools are optional and require explicit allowlisting.
- The plugin uses typed, auditable broker calls only.
