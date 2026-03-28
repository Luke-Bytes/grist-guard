import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../../../src/app.js";
import { createHttpServer } from "../../../src/transport/http/server.js";
import { createTestConfig, FakeGristClient } from "../../../test/test-helpers.js";
import { HttpBrokerClient } from "../src/broker/client.js";
import { buildReadTools } from "../src/tools/read.js";
import { buildWriteTools } from "../src/tools/write.js";

const integrationEnabled = process.env.GRIST_GUARD_PLUGIN_INTEGRATION === "true";
const maybeTest = integrationEnabled ? test : test.skip;

async function startBroker() {
  const config = createTestConfig() as ReturnType<typeof createTestConfig> & { cleanup(): void };
  const app = createApp(config, {
    gristClient: new FakeGristClient(),
  });
  const server = createHttpServer({
    config: app.config,
    logger: app.logger,
    documentService: app.documentService,
    plannerService: app.plannerService,
    executionService: app.executionService,
    auditService: app.auditService,
    metricsService: app.metricsService,
    healthService: app.healthService,
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("broker failed to bind");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: [...config.authTokens][0],
    async close() {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      app.close();
      config.cleanup();
    },
  };
}

maybeTest("plugin tools work against the real local broker flow", async () => {
  const broker = await startBroker();
  const client = new HttpBrokerClient({ baseUrl: broker.baseUrl, token: broker.token });
  const config = {
    baseUrl: broker.baseUrl,
    token: broker.token,
    sampleMaxRows: 10,
    applyPollMs: 1,
    applyTimeoutMs: 50,
    healthcheckOnRegister: false,
  };

  try {
    const readTools = buildReadTools(client, config);
    const writeTools = buildWriteTools(client, config);

    const listResult = await readTools[0].execute("tool-1", {});
    assert.match(listResult.content[0].text, /docA/);

    const schemaResult = await readTools[1].execute("tool-2", { docId: "docA" });
    assert.match(schemaResult.content[0].text, /Tasks/);

    const sampleResult = await readTools[2].execute("tool-3", { docId: "docA", tableId: "Tasks", limit: 2 });
    assert.match(sampleResult.content[0].text, /Example/);

    const addPlanResult = await writeTools[0].execute(
      "tool-4",
      { docId: "docA", tableId: "Tasks", rows: [{ fields: { Title: "Added", Status: "New" } }] },
      { sessionId: "session-1" },
    );
    assert.match(addPlanResult.content[0].text, /"status": "approved"/);

    const updatePlanResult = await writeTools[1].execute(
      "tool-5",
      { docId: "docA", tableId: "Tasks", rows: [{ rowId: 1, fields: { Title: "Updated" } }] },
      { sessionId: "session-1" },
    );
    assert.match(updatePlanResult.content[0].text, /"plan"/);

    const planJson = JSON.parse(addPlanResult.content[0].text);
    const applyResult = await writeTools[3].execute("tool-6", { planId: planJson.plan.id });
    assert.match(applyResult.content[0].text, /"execution"/);
  } finally {
    await broker.close();
  }
});

maybeTest("approval-required flow stops before apply succeeds", async () => {
  const broker = await startBroker();
  const client = new HttpBrokerClient({ baseUrl: broker.baseUrl, token: broker.token });
  const config = {
    baseUrl: broker.baseUrl,
    token: broker.token,
    sampleMaxRows: 10,
    applyPollMs: 1,
    applyTimeoutMs: 50,
    healthcheckOnRegister: false,
  };

  try {
    const writeTools = buildWriteTools(client, config);
    const addPlanResult = await writeTools[0].execute(
      "tool-4",
      {
        docId: "docA",
        tableId: "Tasks",
        rows: Array.from({ length: 51 }, (_, index) => ({ fields: { Title: `Added ${index}`, Status: "New" } })),
      },
      { sessionId: "session-approval" },
    );
    const planJson = JSON.parse(addPlanResult.content[0].text);
    assert.equal(planJson.plan.requiresApproval, true);

    await assert.rejects(writeTools[3].execute("tool-6", { planId: planJson.plan.id }), { code: "approval_required" });
  } finally {
    await broker.close();
  }
});
