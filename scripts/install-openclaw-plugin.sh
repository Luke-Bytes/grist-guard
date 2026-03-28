#!/usr/bin/env bash

set -euo pipefail

PACKAGE_SPEC="${PACKAGE_SPEC:-@grist-guard/grist-guard}"
OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
BROKER_BASE_URL="${BROKER_BASE_URL:-}"
GRIST_BROKER_TOKEN="${GRIST_BROKER_TOKEN:-}"
OPENCLAW_HOME=""
OPENCLAW_CONFIG=""
OPENCLAW_ENV_FILE=""
RESTART_GATEWAY=1
CONFIGURE_AGENT=1

usage() {
  cat <<'EOF'
Usage:
  sudo ./scripts/install-openclaw-plugin.sh --base-url http://127.0.0.1:8787 [options]

Options:
  --base-url URL           Required broker base URL.
  --token TOKEN            Broker token. If omitted, the script prompts securely.
  --package SPEC           Plugin package spec. Default: @grist-guard/grist-guard
  --openclaw-user USER     Gateway user. Default: openclaw
  --skip-agent             Do not create/update the default "grist" agent tool allowlist.
  --skip-restart           Do not restart openclaw-gateway.service or run post-restart checks.
  --help                   Show this help text.

Environment overrides:
  BROKER_BASE_URL
  GRIST_BROKER_TOKEN
  PACKAGE_SPEC
  OPENCLAW_USER
EOF
}

fail() {
  echo "error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

escape_squote() {
  printf "%s" "$1" | sed "s/'/'\\\\''/g"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      [[ $# -ge 2 ]] || fail "--base-url requires a value"
      BROKER_BASE_URL="$2"
      shift 2
      ;;
    --token)
      [[ $# -ge 2 ]] || fail "--token requires a value"
      GRIST_BROKER_TOKEN="$2"
      shift 2
      ;;
    --package)
      [[ $# -ge 2 ]] || fail "--package requires a value"
      PACKAGE_SPEC="$2"
      shift 2
      ;;
    --openclaw-user)
      [[ $# -ge 2 ]] || fail "--openclaw-user requires a value"
      OPENCLAW_USER="$2"
      shift 2
      ;;
    --skip-agent)
      CONFIGURE_AGENT=0
      shift
      ;;
    --skip-restart)
      RESTART_GATEWAY=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ ${EUID} -eq 0 ]] || fail "run this script as root so it can write /home/${OPENCLAW_USER}/.openclaw and restart the gateway"

require_command sudo
require_command node
require_command install
require_command sed
require_command getent

OPENCLAW_HOME="$(getent passwd "${OPENCLAW_USER}" | cut -d: -f6 || true)"
[[ -n "${OPENCLAW_HOME}" ]] || fail "could not resolve home directory for user ${OPENCLAW_USER}"
OPENCLAW_CONFIG="${OPENCLAW_HOME}/.openclaw/openclaw.json"
OPENCLAW_ENV_FILE="${OPENCLAW_HOME}/.openclaw/.env"

require_command openclaw

if [[ -z "${BROKER_BASE_URL}" ]]; then
  fail "missing broker base URL. Pass --base-url or set BROKER_BASE_URL"
fi

BROKER_BASE_URL="$(printf "%s" "${BROKER_BASE_URL}" | sed 's#/*$##')"
[[ -n "${BROKER_BASE_URL}" ]] || fail "broker base URL resolved to an empty value"

if [[ -z "${GRIST_BROKER_TOKEN}" ]]; then
  read -r -s -p "Grist broker token: " GRIST_BROKER_TOKEN
  echo
fi
[[ -n "${GRIST_BROKER_TOKEN}" ]] || fail "missing broker token"

echo "Installing ${PACKAGE_SPEC} for ${OPENCLAW_USER}..."
sudo -iu "${OPENCLAW_USER}" bash -lc "openclaw plugins install '$(escape_squote "${PACKAGE_SPEC}")'"

echo "Writing ${OPENCLAW_ENV_FILE}..."
install -d -o "${OPENCLAW_USER}" -g "${OPENCLAW_USER}" "${OPENCLAW_HOME}/.openclaw"
install -m 600 -o "${OPENCLAW_USER}" -g "${OPENCLAW_USER}" /dev/null "${OPENCLAW_ENV_FILE}"
OPENCLAW_ENV_FILE_PATH="${OPENCLAW_ENV_FILE}" \
GRIST_BROKER_TOKEN="${GRIST_BROKER_TOKEN}" \
node <<'EOF'
const fs = require("node:fs");
const envFile = process.env.OPENCLAW_ENV_FILE_PATH;
const token = process.env.GRIST_BROKER_TOKEN;

if (!envFile || !token) {
  throw new Error("missing OPENCLAW_ENV_FILE_PATH or GRIST_BROKER_TOKEN");
}

const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split(/\r?\n/) : [];
let replaced = false;
const next = lines
  .filter((line, index, all) => !(index === all.length - 1 && line === ""))
  .map((line) => {
    if (line.startsWith("GRIST_BROKER_TOKEN=")) {
      replaced = true;
      return `GRIST_BROKER_TOKEN=${token}`;
    }
    return line;
  });

if (!replaced) {
  next.push(`GRIST_BROKER_TOKEN=${token}`);
}

fs.writeFileSync(envFile, `${next.join("\n")}\n`);
EOF

chmod 600 "${OPENCLAW_ENV_FILE}"
chown "${OPENCLAW_USER}:${OPENCLAW_USER}" "${OPENCLAW_ENV_FILE}"

echo "Updating ${OPENCLAW_CONFIG}..."
OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG}" \
BROKER_BASE_URL="${BROKER_BASE_URL}" \
CONFIGURE_AGENT="${CONFIGURE_AGENT}" \
node <<'EOF'
const fs = require("node:fs");
const path = process.env.OPENCLAW_CONFIG_PATH;
const baseUrl = process.env.BROKER_BASE_URL;
const configureAgent = process.env.CONFIGURE_AGENT === "1";

if (!path || !baseUrl) {
  throw new Error("missing OPENCLAW_CONFIG_PATH or BROKER_BASE_URL");
}

const readJson = () => {
  if (!fs.existsSync(path)) {
    return {};
  }

  const raw = fs.readFileSync(path, "utf8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
};

const ensureArrayIncludes = (value, item) => {
  const next = Array.isArray(value) ? value.slice() : [];
  if (!next.includes(item)) {
    next.push(item);
  }
  return next;
};

const ensureArrayIncludesAll = (value, items) => {
  let next = Array.isArray(value) ? value.slice() : [];
  for (const item of items) {
    if (!next.includes(item)) {
      next.push(item);
    }
  }
  return next;
};

const config = readJson();
config.plugins ??= {};
config.plugins.allow = ensureArrayIncludes(config.plugins.allow, "grist-guard");
config.plugins.entries ??= {};
config.plugins.entries["grist-guard"] = {
  ...(config.plugins.entries["grist-guard"] ?? {}),
  enabled: true,
  config: {
    sampleMaxRows: 25,
    applyPollMs: 500,
    applyTimeoutMs: 10000,
    healthcheckOnRegister: true,
    ...((config.plugins.entries["grist-guard"] ?? {}).config ?? {}),
    baseUrl,
  },
};

if (configureAgent) {
  config.agents ??= {};
  config.agents.entries ??= {};
  const currentAgent = config.agents.entries.grist ?? {};
  const currentTools = currentAgent.tools ?? {};
  config.agents.entries.grist = {
    ...currentAgent,
    enabled: currentAgent.enabled ?? true,
    tools: {
      ...currentTools,
      allow: ensureArrayIncludesAll(currentTools.allow, [
        "grist_list_documents",
        "grist_get_schema",
        "grist_get_sample",
        "grist_plan_add_rows",
        "grist_plan_update_rows",
        "grist_get_plan",
        "grist_apply_plan",
        "grist_get_execution",
        "grist_get_recovery",
        "time",
      ]),
      deny: ensureArrayIncludesAll(currentTools.deny, [
        "exec",
        "browser",
        "write_stdin",
        "apply_patch",
        "edit",
      ]),
    },
  };
}

fs.writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
EOF

chown "${OPENCLAW_USER}:${OPENCLAW_USER}" "${OPENCLAW_CONFIG}"

if [[ "${RESTART_GATEWAY}" -eq 1 ]]; then
  echo "Restarting openclaw-gateway.service..."
  systemctl restart openclaw-gateway.service

  echo "Verifying plugin state..."
  sudo -iu "${OPENCLAW_USER}" bash -lc 'openclaw plugins inspect grist-guard --json'
  sudo -iu "${OPENCLAW_USER}" bash -lc 'openclaw plugins doctor'
else
  echo "Skipping gateway restart. Restart manually when ready:"
  echo "  sudo systemctl restart openclaw-gateway.service"
fi

echo "Done."
