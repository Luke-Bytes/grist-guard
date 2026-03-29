# OpenClaw Plugin Runbook

Future published package:

```text
@grist-guard/grist-guard
```

## Pre-change status

Run as the `openclaw` user:

```bash
sudo -iu openclaw bash -lc 'openclaw status --all && openclaw security audit --deep && openclaw approvals get --gateway'
```

OpenClaw CLI commands should be run as `openclaw` with `sudo -iu openclaw`. Do not assume the root shell has `openclaw` on `PATH`.

## First-Time Install

Run the installer as root:

```bash
sudo ./scripts/install-openclaw-plugin.sh --base-url http://127.0.0.1:8787
```

The script:

- builds the plugin from the repo checkout when `packages/openclaw-plugin-grist-guard/dist/index.js` is missing
- stages the repo-local plugin into `/opt/grist-guard/openclaw-plugin-grist-guard`
- installs that staged plugin with `openclaw plugins install /opt/grist-guard/openclaw-plugin-grist-guard`
- prompts for `GRIST_BROKER_TOKEN` securely unless you pass `--token`
- writes `/home/openclaw/.openclaw/.env`
- merges `/home/openclaw/.openclaw/openclaw.json`
- repairs any stale `tools.allow` + `tools.alsoAllow` conflict from older installer runs
- adds `grist-guard` to `tools.allow` when that array already exists, otherwise to `tools.alsoAllow`
- restarts `openclaw-gateway.service` and runs plugin verification

Non-interactive example:

```bash
sudo GRIST_BROKER_TOKEN=replace-with-broker-token \
  ./scripts/install-openclaw-plugin.sh \
  --base-url http://127.0.0.1:8787
```

If the repo checkout is owned by a different account, override the build user explicitly:

```bash
sudo ./scripts/install-openclaw-plugin.sh --base-url http://127.0.0.1:8787 --build-user luke
```

## Installed Config Shape

After the script runs, `/home/openclaw/.openclaw/openclaw.json` will contain this plugin section:

```json
{
  "plugins": {
    "allow": ["grist-guard"],
    "entries": {
      "grist-guard": {
        "enabled": true,
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
  "tools": {
    "allow": ["grist-guard"]
  }
}
```

If your existing config already uses `tools.allow`, the installer appends `grist-guard` there and removes any stale `tools.alsoAllow` left by an older broken install. If your existing config uses `tools.alsoAllow` without `tools.allow`, the installer preserves that shape.

## Install Commands

The supported operator path is the installer above.

If you need to do it by hand, use the local path install:

```bash
sudo install -d -o root -g root /opt/grist-guard
sudo rm -rf /opt/grist-guard/openclaw-plugin-grist-guard
sudo -iu <build-user> bash -lc 'cd /path/to/grist-guard/packages/openclaw-plugin-grist-guard && npm ci && npm run build'
sudo cp -a ./packages/openclaw-plugin-grist-guard /opt/grist-guard/openclaw-plugin-grist-guard
sudo chown -R root:root /opt/grist-guard/openclaw-plugin-grist-guard
sudo -iu openclaw bash -lc 'openclaw plugins install /opt/grist-guard/openclaw-plugin-grist-guard'
```

Contributor-only linked install:

```bash
sudo -iu openclaw bash -lc 'openclaw plugins install --link /opt/grist-guard/openclaw-plugin-grist-guard'
```

The linked path must be owned by `openclaw` or `root`. Do not combine `--link` with `plugins.load.paths` or any other copy of the same plugin id.

Use `--install-mode package --package @grist-guard/grist-guard` only after the package is actually published.

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

## Startup Behavior

If `baseUrl` or `GRIST_BROKER_TOKEN` is missing, the plugin now stays inactive and logs a warning instead of taking the gateway down. Finish the config, then restart the gateway.
