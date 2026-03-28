#!/usr/bin/env node
import { SqliteStore } from "../src/persistence/sqlite/database.js";
import { RetentionService } from "../src/application/retentionService.js";

const dryRun = process.argv.includes("--dry-run");
const dbPath = process.env.BROKER_DB_PATH ?? "./data/grist-guard.sqlite";
const retentionDays = Number.parseInt(process.env.BROKER_RETENTION_DAYS ?? "90", 10);

const store = new SqliteStore(dbPath);
const retentionService = new RetentionService({
  config: {
    policy: {
      retentionDays,
    },
  },
  store,
});

try {
  const summary = retentionService.prune({ dryRun, retentionDays });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.close();
}
