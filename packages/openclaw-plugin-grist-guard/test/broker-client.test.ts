import test from "node:test";
import assert from "node:assert/strict";
import { HttpBrokerClient } from "../src/broker/client.js";

function mockFetch(
  handler: (input: string, init?: RequestInit) => { status: number; body: unknown },
) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const response = handler(String(input), init);
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("broker client returns successful document list", async () => {
  mockFetch(() => ({
    status: 200,
    body: { requestId: "req-1", documents: [{ docId: "docA", name: "Doc A", tables: ["Tasks"], fullAccess: false }] },
  }));

  const client = new HttpBrokerClient({ baseUrl: "http://broker.test", token: "token" });
  const response = await client.listDocuments();
  assert.equal(response.requestId, "req-1");
  assert.equal(response.documents[0].docId, "docA");
});

test("broker client normalizes 401", async () => {
  mockFetch(() => ({
    status: 401,
    body: { requestId: "req-401", error: { code: "invalid_token", message: "Missing token" } },
  }));

  const client = new HttpBrokerClient({ baseUrl: "http://broker.test", token: "token" });
  await assert.rejects(client.listDocuments(), { name: "BrokerAuthError", statusCode: 401, code: "invalid_token" });
});

test("broker client normalizes 403", async () => {
  mockFetch(() => ({
    status: 403,
    body: { requestId: "req-403", error: { code: "table_not_writable", message: "Denied" } },
  }));

  const client = new HttpBrokerClient({ baseUrl: "http://broker.test", token: "token" });
  await assert.rejects(client.listDocuments(), { name: "BrokerPolicyError", statusCode: 403, code: "table_not_writable" });
});

test("broker client normalizes 409", async () => {
  mockFetch(() => ({
    status: 409,
    body: { requestId: "req-409", error: { code: "approval_required", message: "Approval required" } },
  }));

  const client = new HttpBrokerClient({ baseUrl: "http://broker.test", token: "token" });
  await assert.rejects(client.applyPlan("plan-1"), { name: "BrokerConflictError", statusCode: 409, code: "approval_required" });
});

test("broker client normalizes 503", async () => {
  mockFetch(() => ({
    status: 503,
    body: { requestId: "req-503", error: { code: "downstream_unavailable", message: "Unavailable" } },
  }));

  const client = new HttpBrokerClient({ baseUrl: "http://broker.test", token: "token" });
  await assert.rejects(client.healthReady(), { name: "BrokerUnavailableError", statusCode: 503, code: "downstream_unavailable" });
});

test("broker client normalizes 500", async () => {
  mockFetch(() => ({
    status: 500,
    body: { requestId: "req-500", error: { code: "internal_error", message: "Boom" } },
  }));

  const client = new HttpBrokerClient({ baseUrl: "http://broker.test", token: "token" });
  await assert.rejects(client.listDocuments(), { name: "BrokerInternalError", statusCode: 500, code: "internal_error" });
});
