import { defaultPluginConfig, type GristGuardPluginConfig, type ResolvedPluginRuntimeConfig } from "./types/config.js";

export interface PluginRuntimeResolution {
  config: ResolvedPluginRuntimeConfig | null;
  missing: string[];
}

type RuntimeEnv = Record<string, string | undefined>;

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? Number(value) : fallback;
}

export function resolvePluginRuntimeConfig(
  pluginConfig: Partial<GristGuardPluginConfig>,
  env: RuntimeEnv = process.env,
): PluginRuntimeResolution {
  const baseUrl = readTrimmedString(pluginConfig.baseUrl).replace(/\/+$/, "");
  const token = readTrimmedString(env.GRIST_BROKER_TOKEN);
  const missing: string[] = [];

  if (!baseUrl) {
    missing.push("plugins.entries.grist-guard.config.baseUrl");
  }

  if (!token) {
    missing.push("GRIST_BROKER_TOKEN");
  }

  if (missing.length > 0) {
    return {
      config: null,
      missing,
    };
  }

  return {
    config: {
      baseUrl,
      token,
      sampleMaxRows: readInteger(pluginConfig.sampleMaxRows, defaultPluginConfig.sampleMaxRows),
      applyPollMs: readInteger(pluginConfig.applyPollMs, defaultPluginConfig.applyPollMs),
      applyTimeoutMs: readInteger(pluginConfig.applyTimeoutMs, defaultPluginConfig.applyTimeoutMs),
      healthcheckOnRegister:
        typeof pluginConfig.healthcheckOnRegister === "boolean"
          ? pluginConfig.healthcheckOnRegister
          : defaultPluginConfig.healthcheckOnRegister,
    },
    missing,
  };
}
