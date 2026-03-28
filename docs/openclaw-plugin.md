# OpenClaw Plugin Runbook

Native plugin path:

```text
/mnt/c/Users/Luke/Desktop/Enma/Projects/grist-guard/packages/openclaw-plugin-grist-guard
```

## Pre-change status

Run as the `openclaw` user:

```bash
sudo -iu openclaw bash -lc 'openclaw status --all && openclaw security audit --deep && openclaw approvals get --gateway'
```

## OpenClaw Config Snippet

Paste into `/home/openclaw/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "allow": ["grist-guard"],
    "load": {
      "paths": [
        "/mnt/c/Users/Luke/Desktop/Enma/Projects/grist-guard/packages/openclaw-plugin-grist-guard"
      ]
    },
    "entries": {
      "grist-guard": {
        "enabled": true,
        "env": {
          "GRIST_BROKER_TOKEN": "replace-with-broker-token"
        },
        "config": {
          "baseUrl": "http://127.0.0.1:8787",
          "sampleMaxRows": 25,
          "applyPollMs": 500,
          "applyTimeoutMs": 10000,
          "healthcheckOnRegister": true
        }
      }
    }
  },
  "agents": {
    "entries": {
      "grist": {
        "enabled": true,
        "tools": {
          "allow": [
            "grist_list_documents",
            "grist_get_schema",
            "grist_get_sample",
            "grist_plan_add_rows",
            "grist_plan_update_rows",
            "grist_get_plan",
            "grist_apply_plan",
            "grist_get_execution",
            "grist_get_recovery",
            "time"
          ],
          "deny": ["exec", "browser", "write_stdin", "apply_patch", "edit"]
        }
      }
    }
  }
}
```

## Install Commands

Preferred local-path install:

```bash
sudo -iu openclaw bash -lc 'openclaw plugins install /mnt/c/Users/Luke/Desktop/Enma/Projects/grist-guard/packages/openclaw-plugin-grist-guard'
```

Or rely on `plugins.load.paths` only:

```bash
sudo -iu openclaw bash -lc 'openclaw plugins inspect /mnt/c/Users/Luke/Desktop/Enma/Projects/grist-guard/packages/openclaw-plugin-grist-guard'
```

## Restart And Verify

```bash
sudo systemctl restart openclaw-gateway.service
sudo -iu openclaw bash -lc 'openclaw plugins list'
sudo -iu openclaw bash -lc 'openclaw plugins inspect grist-guard --json'
sudo -iu openclaw bash -lc 'openclaw plugins doctor'
sudo -iu openclaw bash -lc 'openclaw gateway doctor'
```

## Broker Readiness

```bash
curl -sS \
  -H "Authorization: Bearer $GRIST_BROKER_TOKEN" \
  http://127.0.0.1:8787/health/ready
```

## Tool Verification

Confirm the plugin and tools are visible:

```bash
sudo -iu openclaw bash -lc 'openclaw plugins inspect grist-guard --json'
```

Test a read tool:

```bash
sudo -iu openclaw bash -lc '\''openclaw message --agent grist "Call grist_list_documents and then grist_get_schema for docA."'\''
```

Test plan creation:

```bash
sudo -iu openclaw bash -lc '\''openclaw message --agent grist "Read the schema for docA/Tasks, then create a grist_plan_add_rows plan adding one row with Title=Smoke and Status=New. Do not apply it."'\''
```

Verify approval remains human-only:

```bash
sudo -iu openclaw bash -lc 'openclaw grist-plan <planId>'
sudo -iu openclaw bash -lc 'openclaw grist-approve <planId>'
sudo -iu openclaw bash -lc 'openclaw grist-exec <executionId>'
```

The model should not have any tool that approves plans directly.
