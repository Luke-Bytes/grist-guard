#!/usr/bin/env bash

set -euo pipefail

PACKAGE_SPEC="${PACKAGE_SPEC:-@grist-guard/grist-guard}"
OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
BUILD_USER="${BUILD_USER:-${SUDO_USER:-root}}"
BROKER_BASE_URL="${BROKER_BASE_URL:-}"
GRIST_BROKER_TOKEN="${GRIST_BROKER_TOKEN:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_PLUGIN_DIR="${SOURCE_PLUGIN_DIR:-${REPO_ROOT}/packages/openclaw-plugin-grist-guard}"
STAGE_DIR="${STAGE_DIR:-/opt/grist-guard/openclaw-plugin-grist-guard}"
INSTALL_MODE="${INSTALL_MODE:-auto}"
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
  --package SPEC           Published plugin package spec.
  --source-path PATH       Repo-local plugin source path. Default: ./packages/openclaw-plugin-grist-guard
  --stage-dir PATH         Root-owned staging path for local linked installs. Default: /opt/grist-guard/openclaw-plugin-grist-guard
  --install-mode MODE      auto | package | local. Default: auto
  --build-user USER        User that runs npm build steps for local installs. Default: invoking sudo user
  --openclaw-user USER     Gateway user. Default: openclaw
  --skip-agent             Do not add grist-guard to tools.alsoAllow.
  --skip-restart           Do not restart openclaw-gateway.service or run post-restart checks.
  --help                   Show this help text.

Environment overrides:
  BROKER_BASE_URL
  GRIST_BROKER_TOKEN
  PACKAGE_SPEC
  SOURCE_PLUGIN_DIR
  STAGE_DIR
  INSTALL_MODE
  BUILD_USER
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

run_openclaw() {
  sudo -iu "${OPENCLAW_USER}" bash -lc "$1"
}

run_build_user() {
  if [[ "${BUILD_USER}" == "root" ]]; then
    bash -lc "$1"
  else
    sudo -iu "${BUILD_USER}" bash -lc "$1"
  fi
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
    --source-path)
      [[ $# -ge 2 ]] || fail "--source-path requires a value"
      SOURCE_PLUGIN_DIR="$2"
      shift 2
      ;;
    --stage-dir)
      [[ $# -ge 2 ]] || fail "--stage-dir requires a value"
      STAGE_DIR="$2"
      shift 2
      ;;
    --install-mode)
      [[ $# -ge 2 ]] || fail "--install-mode requires a value"
      INSTALL_MODE="$2"
      shift 2
      ;;
    --openclaw-user)
      [[ $# -ge 2 ]] || fail "--openclaw-user requires a value"
      OPENCLAW_USER="$2"
      shift 2
      ;;
    --build-user)
      [[ $# -ge 2 ]] || fail "--build-user requires a value"
      BUILD_USER="$2"
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
require_command npm
require_command install
require_command sed
require_command getent
require_command cp
require_command rm

OPENCLAW_HOME="$(getent passwd "${OPENCLAW_USER}" | cut -d: -f6 || true)"
[[ -n "${OPENCLAW_HOME}" ]] || fail "could not resolve home directory for user ${OPENCLAW_USER}"
OPENCLAW_CONFIG="${OPENCLAW_HOME}/.openclaw/openclaw.json"
OPENCLAW_ENV_FILE="${OPENCLAW_HOME}/.openclaw/.env"

run_openclaw 'command -v openclaw >/dev/null 2>&1' || fail "openclaw CLI is not available for user ${OPENCLAW_USER}. Run commands as that user with sudo -iu ${OPENCLAW_USER}."

if [[ -z "${BROKER_BASE_URL}" ]]; then
  fail "missing broker base URL. Pass --base-url or set BROKER_BASE_URL"
fi

BROKER_BASE_URL="$(printf "%s" "${BROKER_BASE_URL}" | sed 's#/*$##')"
[[ -n "${BROKER_BASE_URL}" ]] || fail "broker base URL resolved to an empty value"

case "${INSTALL_MODE}" in
  auto)
    if [[ -f "${SOURCE_PLUGIN_DIR}/openclaw.plugin.json" ]]; then
      INSTALL_MODE="local"
    else
      INSTALL_MODE="package"
    fi
    ;;
  package|local)
    ;;
  *)
    fail "invalid --install-mode value: ${INSTALL_MODE}"
    ;;
esac

if [[ -z "${GRIST_BROKER_TOKEN}" ]]; then
  read -r -s -p "Grist broker token: " GRIST_BROKER_TOKEN
  echo
fi
[[ -n "${GRIST_BROKER_TOKEN}" ]] || fail "missing broker token"

if [[ "${INSTALL_MODE}" == "local" ]]; then
  [[ -f "${SOURCE_PLUGIN_DIR}/openclaw.plugin.json" ]] || fail "local plugin source not found: ${SOURCE_PLUGIN_DIR}"

  if [[ ! -f "${SOURCE_PLUGIN_DIR}/dist/index.js" ]]; then
    [[ -f "${SOURCE_PLUGIN_DIR}/package-lock.json" ]] || fail "local plugin lockfile missing: ${SOURCE_PLUGIN_DIR}/package-lock.json"

    echo "Building local plugin in ${SOURCE_PLUGIN_DIR} as ${BUILD_USER}..."
    run_build_user "cd '$(escape_squote "${SOURCE_PLUGIN_DIR}")' && npm ci && npm run build"
  fi

  [[ -f "${SOURCE_PLUGIN_DIR}/dist/index.js" ]] || fail "local plugin build artifact still missing after build: ${SOURCE_PLUGIN_DIR}/dist/index.js"

  echo "Staging local plugin from ${SOURCE_PLUGIN_DIR} to ${STAGE_DIR}..."
  install -d -o root -g root "$(dirname "${STAGE_DIR}")"
  rm -rf "${STAGE_DIR}"
  install -d -o root -g root "${STAGE_DIR}"
  cp -a "${SOURCE_PLUGIN_DIR}/." "${STAGE_DIR}/"
  chown -R root:root "${STAGE_DIR}"

  echo "Installing linked plugin from ${STAGE_DIR} for ${OPENCLAW_USER}..."
  run_openclaw "openclaw plugins install --link '$(escape_squote "${STAGE_DIR}")'"
else
  echo "Installing ${PACKAGE_SPEC} for ${OPENCLAW_USER}..."
  run_openclaw "openclaw plugins install '$(escape_squote "${PACKAGE_SPEC}")'"
fi

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
  config.tools ??= {};
  if (Array.isArray(config.tools.allow)) {
    config.tools.allow = ensureArrayIncludes(config.tools.allow, "grist-guard");
    delete config.tools.alsoAllow;
  } else {
    config.tools.alsoAllow = ensureArrayIncludes(config.tools.alsoAllow, "grist-guard");
  }
}

fs.writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
EOF

chown "${OPENCLAW_USER}:${OPENCLAW_USER}" "${OPENCLAW_CONFIG}"

if [[ "${RESTART_GATEWAY}" -eq 1 ]]; then
  echo "Restarting openclaw-gateway.service..."
  systemctl restart openclaw-gateway.service

  echo "Verifying plugin state..."
  run_openclaw 'openclaw status --all && openclaw security audit --deep && openclaw approvals get --gateway'
  run_openclaw 'openclaw plugins inspect grist-guard --json'
  run_openclaw 'openclaw plugins doctor'
else
  echo "Skipping gateway restart. Restart manually when ready:"
  echo "  sudo systemctl restart openclaw-gateway.service"
fi

echo "Done."
