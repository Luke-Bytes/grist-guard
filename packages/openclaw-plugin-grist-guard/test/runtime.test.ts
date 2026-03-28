import test from "node:test";
import assert from "node:assert/strict";
import { resolvePluginRuntimeConfig } from "../src/runtime.js";

test("runtime config stays inactive until baseUrl and token are both configured", () => {
  const resolution = resolvePluginRuntimeConfig({}, {});
  assert.equal(resolution.config, null);
  assert.deepEqual(resolution.missing, ["plugins.entries.grist-guard.config.baseUrl", "GRIST_BROKER_TOKEN"]);
});

test("runtime config trims values and applies defaults", () => {
  const resolution = resolvePluginRuntimeConfig(
    {
      baseUrl: " http://127.0.0.1:8787/ ",
    },
    {
      GRIST_BROKER_TOKEN: " test-token ",
    },
  );

  assert.ok(resolution.config);
  assert.equal(resolution.config.baseUrl, "http://127.0.0.1:8787");
  assert.equal(resolution.config.token, "test-token");
  assert.equal(resolution.config.sampleMaxRows, 25);
  assert.equal(resolution.config.applyPollMs, 500);
  assert.equal(resolution.config.applyTimeoutMs, 10_000);
  assert.equal(resolution.config.healthcheckOnRegister, true);
});
