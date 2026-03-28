import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAllowedDocuments(raw) {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.map((docId) => [docId, true]));
    }

    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    throw new Error("BROKER_ALLOWED_DOCUMENTS_JSON must be valid JSON");
  }
}

function loadDotEnvFile() {
  const path = ".env";
  if (!existsSync(path)) {
    return {};
  }

  const result = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function loadConfig(env = process.env) {
  const mergedEnv = {
    ...loadDotEnvFile(),
    ...env,
  };

  const dbPath = mergedEnv.BROKER_DB_PATH ?? "./data/grist-guard.sqlite";

  mkdirSync(dirname(dbPath), { recursive: true });

  const tokens = (mergedEnv.BROKER_AUTH_TOKENS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("BROKER_AUTH_TOKENS must contain at least one token");
  }

  const config = {
    serviceName: "grist-guard-broker",
    host: mergedEnv.BROKER_HOST ?? "127.0.0.1",
    port: parseInteger(mergedEnv.BROKER_PORT, 8787),
    authTokens: new Set(tokens),
    dbPath,
    grist: {
      baseUrl: (mergedEnv.GRIST_BASE_URL ?? "").replace(/\/+$/, ""),
      apiKey: mergedEnv.GRIST_API_KEY ?? "",
    },
    policy: {
      allowDestructive: parseBoolean(mergedEnv.BROKER_ALLOW_DESTRUCTIVE, false),
      autoApplyRowLimit: parseInteger(mergedEnv.BROKER_AUTO_APPLY_ROW_LIMIT, 50),
      maxPlanRows: parseInteger(mergedEnv.BROKER_MAX_PLAN_ROWS, 100),
      readSampleLimit: parseInteger(mergedEnv.BROKER_READ_SAMPLE_LIMIT, 25),
      requireApprovalForSchema: parseBoolean(mergedEnv.BROKER_REQUIRE_APPROVAL_FOR_SCHEMA, true),
      requireApprovalForFormulas: parseBoolean(mergedEnv.BROKER_REQUIRE_APPROVAL_FOR_FORMULAS, true),
      requireRecoveryMarker: parseBoolean(mergedEnv.BROKER_REQUIRE_RECOVERY_MARKER, true),
      healthcheckTtlMs: parseInteger(mergedEnv.BROKER_HEALTHCHECK_TTL_MS, 5000),
      retryAttempts: parseInteger(mergedEnv.BROKER_RETRY_ATTEMPTS, 3),
      retryBaseMs: parseInteger(mergedEnv.BROKER_RETRY_BASE_MS, 250),
      retentionDays: parseInteger(mergedEnv.BROKER_RETENTION_DAYS, 90),
      allowedDocuments: parseAllowedDocuments(mergedEnv.BROKER_ALLOWED_DOCUMENTS_JSON),
    },
  };

  if (!config.grist.baseUrl) {
    throw new Error("GRIST_BASE_URL is required");
  }

  if (!config.grist.apiKey) {
    throw new Error("GRIST_API_KEY is required");
  }

  return config;
}
