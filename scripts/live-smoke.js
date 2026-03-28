#!/usr/bin/env node
import { once } from "node:events";

import { createApp } from "../src/app.js";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
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
  if (!response.ok) {
    throw new Error(`${path} failed: ${JSON.stringify(payload)}`);
  }

  return payload;
}

const docId = required("LIVE_GRIST_DOC_ID");
const tableId = required("LIVE_GRIST_TABLE_ID");
const token = process.env.LIVE_BROKER_TOKEN ?? "live-test-token";
const rowPayload = JSON.parse(required("LIVE_TEST_ROW_JSON"));

const config = {
  serviceName: "grist-guard-live-smoke",
  host: "127.0.0.1",
  port: 0,
  authTokens: new Set([token]),
  dbPath: process.env.LIVE_BROKER_DB_PATH ?? "./data/live-smoke.sqlite",
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
        name: "Live Smoke",
        tables: {
          [tableId]: {
            read: true,
            write: true,
            allowedColumns: Object.keys(rowPayload),
          },
        },
      },
    },
  },
};

const app = createApp(config);
app.server.listen(0, "127.0.0.1");
await once(app.server, "listening");

const address = app.server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const readyResponse = await fetch(`${baseUrl}/health/ready`);
  const ready = await readyResponse.json();
  console.log("ready", ready.status);

  const planResponse = await request(baseUrl, token, "/v1/plans", {
    method: "POST",
    body: {
      actionType: "add_rows",
      target: { docId, tableId },
      payload: {
        rows: [{ fields: rowPayload }],
      },
      idempotencyKey: `live-smoke-${Date.now()}`,
    },
  });

  const plan = planResponse.plan;
  if (plan.requiresApproval) {
    await request(baseUrl, token, `/v1/plans/${plan.id}/approve`, {
      method: "POST",
      body: { comment: "live smoke approval" },
    });
  }

  const execution = await request(baseUrl, token, `/v1/plans/${plan.id}/apply`, {
    method: "POST",
    body: {},
  });

  const recovery = await request(baseUrl, token, `/v1/executions/${execution.execution.id}/recovery`);
  console.log(JSON.stringify({ planId: plan.id, executionId: execution.execution.id, recovery }, null, 2));
} finally {
  app.close();
}
