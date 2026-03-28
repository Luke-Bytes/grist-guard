export interface GristGuardPluginConfig {
  baseUrl: string;
  sampleMaxRows: number;
  applyPollMs: number;
  applyTimeoutMs: number;
  healthcheckOnRegister: boolean;
}

export interface ResolvedPluginRuntimeConfig extends GristGuardPluginConfig {
  token: string;
}

export const defaultPluginConfig: Omit<ResolvedPluginRuntimeConfig, "baseUrl" | "token"> = {
  sampleMaxRows: 25,
  applyPollMs: 500,
  applyTimeoutMs: 10_000,
  healthcheckOnRegister: true,
};
