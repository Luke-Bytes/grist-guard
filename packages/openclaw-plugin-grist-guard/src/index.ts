import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { HttpBrokerClient } from "./broker/client.js";
import { registerCliCommands } from "./cli/index.js";
import { resolvePluginRuntimeConfig } from "./runtime.js";
import { buildReadTools } from "./tools/read.js";
import { buildWriteTools } from "./tools/write.js";

function logWarning(api: any, message: string, details?: Record<string, unknown>) {
  const logger = api?.logger;

  try {
    if (typeof logger?.warn === "function") {
      logger.warn({ pluginId: "grist-guard", ...details }, message);
      return;
    }

    if (typeof logger?.info === "function") {
      logger.info({ pluginId: "grist-guard", ...details }, message);
      return;
    }
  } catch {
    // Fall through to stderr if the host logger expects a different signature.
  }

  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.warn(`[grist-guard] ${message}${suffix}`);
}

const pluginConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    baseUrl: {
      type: "string",
      minLength: 1,
      description: "Base URL for the grist-guard broker, for example http://127.0.0.1:8787",
    },
    sampleMaxRows: { type: "integer", minimum: 1, maximum: 200, default: 25 },
    applyPollMs: { type: "integer", minimum: 50, default: 500 },
    applyTimeoutMs: { type: "integer", minimum: 100, default: 10000 },
    healthcheckOnRegister: {
      type: "boolean",
      default: true,
      description: "When true, the plugin runs a background broker readiness probe during startup.",
    },
  },
} as const;

export default definePluginEntry({
  id: "grist-guard",
  name: "Grist Guard",
  description: "Grist broker tools for OpenClaw",
  configSchema: pluginConfigSchema as any,
  register(api: any) {
    const resolution = resolvePluginRuntimeConfig(api.pluginConfig ?? {});

    if (!resolution.config) {
      logWarning(
        api,
        "Plugin is installed but inactive until configuration is complete. Set plugins.entries.grist-guard.config.baseUrl and provide GRIST_BROKER_TOKEN via ~/.openclaw/.env or top-level env.vars.",
        { missing: resolution.missing },
      );
      return;
    }

    const config = resolution.config;
    const client = new HttpBrokerClient({
      baseUrl: config.baseUrl,
      token: config.token,
      timeoutMs: Math.min(config.applyTimeoutMs, 5_000),
    });

    if (config.healthcheckOnRegister) {
      void client.healthReady().catch((error) => {
        logWarning(api, "Background broker readiness probe failed.", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
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
