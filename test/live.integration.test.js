import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { createApp } from "../src/app.js";

const liveEnabled = process.env.LIVE_GRIST_TESTS === "true";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for live tests`);
  }

  return value;
}

async function request(baseUrl, token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json();
  return { response, payload };
}

const maybeTest = liveEnabled ? test : test.skip;

maybeTest("live broker integration against real Grist", async () => {
  const docId = required("LIVE_GRIST_DOC_ID");
  const tableId = required("LIVE_GRIST_TABLE_ID");
  const token = process.env.LIVE_BROKER_TOKEN ?? "live-test-token";
  const rowPayload = JSON.parse(required("LIVE_TEST_ROW_JSON"));
  const allowedColumns = Object.keys(rowPayload);

  const app = createApp({
    serviceName: "grist-guard-live-test",
    host: "127.0.0.1",
    port: 0,
    authTokens: new Set([token]),
    dbPath: process.env.LIVE_BROKER_DB_PATH ?? "./data/live-integration.sqlite",
    grist: {
      baseUrl: required("LIVE_GRIST_BASE_URL"),
      apiKey: required("LIVE_GRIST_API_KEY"),
    },
    policy: {
      allowDestructive: false,
      autoApplyRowLimit: 50,
      maxPlanRows: 100,
      readSampleLimit: 25,
      requireApprovalForSchema: true,
      requireApprovalForFormulas: true,
      requireRecoveryMarker: true,
      healthcheckTtlMs: 1000,
      retryAttempts: 3,
      retryBaseMs: 250,
      retentionDays: 90,
      allowedDocuments: {
        [docId]: {
          name: "Live Integration",
          tables: {
            [tableId]: {
              read: true,
              write: true,
              allowedColumns,
            },
          },
        },
      },
    },
  });

  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const schemaResponse = await request(baseUrl, token, `/v1/documents/${docId}/schema`);
    assert.equal(schemaResponse.response.status, 200);

    const sampleResponse = await request(baseUrl, token, `/v1/documents/${docId}/tables/${tableId}/sample?limit=1`);
    assert.equal(sampleResponse.response.status, 200);

    const planResponse = await request(baseUrl, token, "/v1/plans", {
      method: "POST",
      body: {
        actionType: "add_rows",
        target: { docId, tableId },
        payload: {
          rows: [{ fields: rowPayload }],
        },
        idempotencyKey: `live-test-${Date.now()}`,
      },
    });
    assert.equal(planResponse.response.status, 201);

    if (planResponse.payload.plan.requiresApproval) {
      const approveResponse = await request(baseUrl, token, `/v1/plans/${planResponse.payload.plan.id}/approve`, {
        method: "POST",
        body: { comment: "live integration approval" },
      });
      assert.equal(approveResponse.response.status, 200);
    }

    const applyResponse = await request(baseUrl, token, `/v1/plans/${planResponse.payload.plan.id}/apply`, {
      method: "POST",
      body: {},
    });
    assert.equal(applyResponse.response.status, 200);

    const recoveryResponse = await request(baseUrl, token, `/v1/executions/${applyResponse.payload.execution.id}/recovery`);
    assert.equal(recoveryResponse.response.status, 200);
    assert.ok(recoveryResponse.payload.recovery.latestState || recoveryResponse.payload.recovery.latestSnapshot);

    const forbiddenResponse = await request(baseUrl, token, "/v1/plans", {
      method: "POST",
      body: {
        actionType: "add_rows",
        target: { docId, tableId },
        payload: {
          rows: [{ fields: { ForbiddenColumn: "nope" } }],
        },
      },
    });
    assert.equal(forbiddenResponse.response.status, 403);
  } finally {
    app.close();
  }
});
