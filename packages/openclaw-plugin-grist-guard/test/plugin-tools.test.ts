import test from "node:test";
import assert from "node:assert/strict";
import { createDeterministicIdempotencyKey } from "../src/broker/idempotency.js";
import { buildReadTools } from "../src/tools/read.js";
import { buildWriteTools } from "../src/tools/write.js";

const config = {
  baseUrl: "http://broker.test",
  token: "token",
  sampleMaxRows: 2,
  applyPollMs: 1,
  applyTimeoutMs: 5,
  healthcheckOnRegister: false,
};

test("read tool validation bounds sample rows", async () => {
  const tools = buildReadTools(
    {
      listDocuments: async () => ({ requestId: "req-1", documents: [] }),
      getSchema: async () => ({ requestId: "req-2", schema: { metadata: { id: "docA" }, tables: { tables: [] } } }),
      getSample: async (_docId: string, _tableId: string, limit: number) => ({
        requestId: "req-3",
        sample: { docId: "docA", tableId: "Tasks", records: [], options: { limit } },
      }),
    } as any,
    config,
  );

  const sampleTool = tools.find((tool) => tool.name === "grist_get_sample");
  const result = await sampleTool!.execute("tool-1", { docId: "docA", tableId: "Tasks", limit: 5 });
  assert.match(result.content[0].text, /"limit": 2/);
});

test("write tool input validation rejects invalid row ids", async () => {
  const tools = buildWriteTools({} as any, config);
  const updateTool = tools.find((tool) => tool.name === "grist_plan_update_rows");
  await assert.rejects(
    updateTool!.execute("tool-1", { docId: "docA", tableId: "Tasks", rows: [{ rowId: 0, fields: {} }] }),
    /rows\[0\]\.rowId must be a positive integer/,
  );
});

test("idempotency keys are deterministic inside a session", () => {
  const first = createDeterministicIdempotencyKey({
    sessionId: "session-1",
    toolName: "grist_plan_add_rows",
    target: { docId: "docA", tableId: "Tasks" },
    payload: { rows: [{ fields: { Title: "A", Status: "New" } }] },
  });
  const second = createDeterministicIdempotencyKey({
    sessionId: "session-1",
    toolName: "grist_plan_add_rows",
    target: { tableId: "Tasks", docId: "docA" },
    payload: { rows: [{ fields: { Status: "New", Title: "A" } }] },
  });
  assert.equal(first, second);
});

test("apply tool surfaces timeout cleanly", async () => {
  const tools = buildWriteTools(
    {
      applyPlan: async () => ({
        requestId: "req-apply",
        execution: {
          id: "exec-1",
          planId: "plan-1",
          status: "succeeded",
          createdAt: new Date().toISOString(),
          finishedAt: null,
          result: null,
          error: null,
          recovery: null,
          beforeState: null,
        },
      }),
      getExecution: async () => ({
        requestId: "req-exec",
        execution: {
          id: "exec-1",
          planId: "plan-1",
          status: "succeeded",
          createdAt: new Date().toISOString(),
          finishedAt: null,
          result: null,
          error: null,
          recovery: null,
          beforeState: null,
        },
      }),
    } as any,
    config,
  );
  const applyTool = tools.find((tool) => tool.name === "grist_apply_plan");
  const result = await applyTool!.execute("tool-1", { planId: "plan-1" });
  assert.match(result.content[0].text, /"timedOut": true/);
});

test("apply tool preserves approval-required broker response", async () => {
  const tools = buildWriteTools(
    {
      applyPlan: async () => {
        const error = new Error("Approval required") as Error & { statusCode: number; code: string };
        error.statusCode = 409;
        error.code = "approval_required";
        throw error;
      },
    } as any,
    config,
  );
  const applyTool = tools.find((tool) => tool.name === "grist_apply_plan");
  await assert.rejects(applyTool!.execute("tool-1", { planId: "plan-1" }), { code: "approval_required" });
});
