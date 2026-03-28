import test from "node:test";
import assert from "node:assert/strict";

import { SqliteStore } from "../src/persistence/sqlite/database.js";
import { PlannerService } from "../src/application/plannerService.js";
import { createTestConfig, FakeGristClient } from "./test-helpers.js";

test("planner creates auto-approved row plan within threshold", async () => {
  const config = createTestConfig();
  const store = new SqliteStore(config.dbPath);
  const planner = new PlannerService({
    config,
    store,
    gristClient: new FakeGristClient(),
  });

  const plan = await planner.createPlan(
    {
      actionType: "add_rows",
      target: { docId: "docA", tableId: "Tasks" },
      payload: {
        rows: [
          { fields: { Title: "One", Status: "New" } },
        ],
      },
      idempotencyKey: "same-key",
    },
    {
      requestId: "req-1",
      actorId: "tester",
    },
  );

  assert.equal(plan.status, "approved");
  assert.equal(plan.requiresApproval, false);

  const replay = await planner.createPlan(
    {
      actionType: "add_rows",
      target: { docId: "docA", tableId: "Tasks" },
      payload: {
        rows: [
          { fields: { Title: "One", Status: "New" } },
        ],
      },
      idempotencyKey: "same-key",
    },
    {
      requestId: "req-2",
      actorId: "tester",
    },
  );

  assert.equal(replay.id, plan.id);

  store.close();
  config.cleanup();
});
