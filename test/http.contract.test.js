import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { createRequestHandler } from "../src/transport/http/server.js";
import { createTestConfig, FakeGristClient } from "./test-helpers.js";

function createMockRequest({ method = "GET", url = "/", headers = {}, body } = {}) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];

  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function createMockResponse() {
  const state = {
    statusCode: null,
    body: "",
  };

  return {
    writeHead(statusCode) {
      state.statusCode = statusCode;
    },
    end(chunk = "") {
      state.body += chunk;
    },
    get statusCode() {
      return state.statusCode;
    },
    get payload() {
      return JSON.parse(state.body);
    },
  };
}

function createHarness() {
  const config = createTestConfig();
  const app = createApp(config, {
    gristClient: new FakeGristClient(),
  });

  const handler = createRequestHandler({
    config: app.config,
    logger: app.logger,
    documentService: app.documentService,
    plannerService: app.plannerService,
    executionService: app.executionService,
    auditService: app.auditService,
    metricsService: app.metricsService,
    healthService: app.healthService,
  });

  return { config, app, handler };
}

test("broker rejects missing auth and exposes metrics with auth", async () => {
  const { config, app, handler } = createHarness();

  try {
    const unauthenticatedResponse = createMockResponse();
    await handler(createMockRequest({ method: "GET", url: "/v1/documents" }), unauthenticatedResponse);
    assert.equal(unauthenticatedResponse.statusCode, 401);

    const token = [...config.authTokens][0];
    const metricsResponse = createMockResponse();
    await handler(
      createMockRequest({
        method: "GET",
        url: "/v1/metrics",
        headers: {
          authorization: `Bearer ${token}`,
          host: "localhost",
        },
      }),
      metricsResponse,
    );

    assert.equal(metricsResponse.statusCode, 200);
    assert.equal(typeof metricsResponse.payload.metrics.counters.http_requests_total, "number");
  } finally {
    app.close();
    config.cleanup();
  }
});

test("execution recovery endpoint returns captured metadata", async () => {
  const { config, app, handler } = createHarness();
  const token = [...config.authTokens][0];

  try {
    const planResponse = createMockResponse();
    await handler(
      createMockRequest({
        method: "POST",
        url: "/v1/plans",
        headers: {
          authorization: `Bearer ${token}`,
          host: "localhost",
          "content-type": "application/json",
        },
        body: {
          actionType: "add_rows",
          target: { docId: "docA", tableId: "Tasks" },
          payload: {
            rows: [{ fields: { Title: "contract", Status: "New" } }],
          },
        },
      }),
      planResponse,
    );

    const applyResponse = createMockResponse();
    await handler(
      createMockRequest({
        method: "POST",
        url: `/v1/plans/${planResponse.payload.plan.id}/apply`,
        headers: {
          authorization: `Bearer ${token}`,
          host: "localhost",
          "content-type": "application/json",
        },
        body: {},
      }),
      applyResponse,
    );

    const recoveryResponse = createMockResponse();
    await handler(
      createMockRequest({
        method: "GET",
        url: `/v1/executions/${applyResponse.payload.execution.id}/recovery`,
        headers: {
          authorization: `Bearer ${token}`,
          host: "localhost",
        },
      }),
      recoveryResponse,
    );

    assert.equal(recoveryResponse.statusCode, 200);
    assert.equal(typeof recoveryResponse.payload.recovery.capturedAt, "string");
  } finally {
    app.close();
    config.cleanup();
  }
});
