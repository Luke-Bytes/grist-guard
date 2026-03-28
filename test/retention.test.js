import test from "node:test";
import assert from "node:assert/strict";

import { SqliteStore } from "../src/persistence/sqlite/database.js";
import { RetentionService } from "../src/application/retentionService.js";
import { createTestConfig } from "./test-helpers.js";

test("retention service reports dry-run deletions", () => {
  const config = createTestConfig();
  const store = new SqliteStore(config.dbPath);
  const retentionService = new RetentionService({ config, store });

  store.insertAuditEvent({
    id: "audit-1",
    request_id: "req-1",
    event_type: "test.event",
    actor_id: "tester",
    resource_id: null,
    payload_json: "{}",
    created_at: "2000-01-01T00:00:00.000Z",
  });

  const summary = retentionService.prune({ dryRun: true, retentionDays: 1 });
  assert.equal(summary.deletedAuditEvents, 1);
  assert.equal(summary.dryRun, true);

  store.close();
  config.cleanup();
});
