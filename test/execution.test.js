import test from "node:test";
import assert from "node:assert/strict";

import { SqliteStore } from "../src/persistence/sqlite/database.js";
import { PlannerService } from "../src/application/plannerService.js";
import { ExecutionService } from "../src/application/executionService.js";
import { MetricsService } from "../src/application/metricsService.js";
import { ExecutionLockManager } from "../src/application/executionLockManager.js";
import { createTestConfig, FakeGristClient } from "./test-helpers.js";

test("schema-changing plans require approval and then execute", async () => {
  const config = createTestConfig();
  const store = new SqliteStore(config.dbPath);
  const gristClient = new FakeGristClient();
  const planner = new PlannerService({ config, store, gristClient });
  const execution = new ExecutionService({
    config,
    store,
    gristClient,
    lockManager: new ExecutionLockManager(),
    metricsService: new MetricsService(),
  });

  const plan = await planner.createPlan(
    {
      actionType: "add_column",
      target: { docId: "docA", tableId: "Tasks" },
      payload: {
        column: { id: "Notes", type: "Text" },
      },
    },
    {
      requestId: "req-1",
      actorId: "tester",
    },
  );

  assert.equal(plan.status, "pending_approval");

  const approved = execution.approvePlan(plan.id, "approver", "looks good");
  assert.equal(approved.status, "approved");

  const result = await execution.applyPlan(plan.id);
  assert.equal(result.status, "succeeded");
  assert.equal(gristClient.executed.length, 1);
  assert.ok(result.recovery.latestSnapshot);

  store.close();
  config.cleanup();
});
