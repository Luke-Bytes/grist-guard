import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { HttpBrokerClient } from "./broker/client.js";
import { registerCliCommands } from "./cli/index.js";
import { buildReadTools } from "./tools/read.js";
import { buildWriteTools } from "./tools/write.js";
import { defaultPluginConfig, type GristGuardPluginConfig, type ResolvedPluginRuntimeConfig } from "./types/config.js";

function resolveConfig(api: any): ResolvedPluginRuntimeConfig {
  const config = (api.pluginConfig ?? {}) as Partial<GristGuardPluginConfig>;
  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.trim().replace(/\/+$/, "") : "";
  const token = process.env.GRIST_BROKER_TOKEN?.trim() ?? "";

  if (!baseUrl) {
    throw new Error("plugins.entries.grist-guard.config.baseUrl is required");
  }

  if (!token) {
    throw new Error("plugins.entries.grist-guard.env.GRIST_BROKER_TOKEN is required");
  }

  return {
    baseUrl,
    token,
    sampleMaxRows: Number.isInteger(config.sampleMaxRows) ? Number(config.sampleMaxRows) : defaultPluginConfig.sampleMaxRows,
    applyPollMs: Number.isInteger(config.applyPollMs) ? Number(config.applyPollMs) : defaultPluginConfig.applyPollMs,
    applyTimeoutMs: Number.isInteger(config.applyTimeoutMs)
      ? Number(config.applyTimeoutMs)
      : defaultPluginConfig.applyTimeoutMs,
    healthcheckOnRegister:
      typeof config.healthcheckOnRegister === "boolean"
        ? config.healthcheckOnRegister
        : defaultPluginConfig.healthcheckOnRegister,
  };
}

const pluginConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    baseUrl: { type: "string", minLength: 1 },
    sampleMaxRows: { type: "integer", minimum: 1, maximum: 200 },
    applyPollMs: { type: "integer", minimum: 50 },
    applyTimeoutMs: { type: "integer", minimum: 100 },
    healthcheckOnRegister: { type: "boolean" },
  },
  required: ["baseUrl"],
} as const;

export default definePluginEntry({
  id: "grist-guard",
  name: "Grist Guard",
  description: "Grist broker tools for OpenClaw",
  configSchema: pluginConfigSchema as any,
  async register(api: any) {
    const config = resolveConfig(api);
    const client = new HttpBrokerClient({
      baseUrl: config.baseUrl,
      token: config.token,
      timeoutMs: Math.min(config.applyTimeoutMs, 5_000),
    });

    if (config.healthcheckOnRegister) {
      await client.healthReady();
    }

    for (const tool of buildReadTools(client, config)) {
      api.registerTool(tool);
    }

    for (const tool of buildWriteTools(client, config)) {
      api.registerTool(tool, { optional: true });
    }

    registerCliCommands(api, client);
  },
});
