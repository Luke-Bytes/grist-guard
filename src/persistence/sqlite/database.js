import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function migrate(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      action_type TEXT NOT NULL,
      target_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      normalized_json TEXT NOT NULL,
      schema_fingerprint TEXT NOT NULL,
      requires_approval INTEGER NOT NULL,
      approval_reason TEXT,
      status TEXT NOT NULL,
      warnings_json TEXT NOT NULL,
      request_id TEXT NOT NULL,
      caller_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      applied_at TEXT
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL,
      before_state_json TEXT,
      recovery_json TEXT,
      result_json TEXT,
      error_json TEXT,
      created_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      resource_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn(database, "executions", "recovery_json", "TEXT");
}

function ensureColumn(database, tableName, columnName, columnDefinition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

export class SqliteStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    migrate(this.database);

    this.insertPlanStatement = this.database.prepare(`
      INSERT INTO plans (
        id, idempotency_key, action_type, target_json, payload_json, normalized_json,
        schema_fingerprint, requires_approval, approval_reason, status, warnings_json,
        request_id, caller_id, created_at, approved_at, applied_at
      ) VALUES (
        @id, @idempotency_key, @action_type, @target_json, @payload_json, @normalized_json,
        @schema_fingerprint, @requires_approval, @approval_reason, @status, @warnings_json,
        @request_id, @caller_id, @created_at, NULL, NULL
      )
    `);
  }

  close() {
    this.database.close();
  }

  insertPlan(plan) {
    this.insertPlanStatement.run({
      id: plan.id,
      idempotency_key: plan.idempotency_key,
      action_type: plan.action_type,
      target_json: plan.target_json,
      payload_json: plan.payload_json,
      normalized_json: plan.normalized_json,
      schema_fingerprint: plan.schema_fingerprint,
      requires_approval: plan.requiresApproval ? 1 : 0,
      approval_reason: plan.approval_reason,
      status: plan.status,
      warnings_json: plan.warnings_json,
      request_id: plan.request_id,
      caller_id: plan.caller_id,
      created_at: plan.created_at,
    });
  }

  findPlanByIdempotencyKey(idempotencyKey) {
    const row = this.database
      .prepare("SELECT * FROM plans WHERE idempotency_key = ?")
      .get(idempotencyKey);
    return row ? hydratePlan(row) : null;
  }

  getPlan(planId) {
    const row = this.database.prepare("SELECT * FROM plans WHERE id = ?").get(planId);
    return row ? hydratePlan(row) : null;
  }

  updatePlanStatus(planId, status, timestampField, timestamp) {
    const field = timestampField === "approved_at" ? "approved_at" : "applied_at";
    this.database.prepare(`UPDATE plans SET status = ?, ${field} = ? WHERE id = ?`).run(status, timestamp, planId);
  }

  insertApproval(approval) {
    this.database.prepare(`
      INSERT INTO approvals (id, plan_id, approver_id, decision, comment, created_at)
      VALUES (@id, @plan_id, @approver_id, @decision, @comment, @created_at)
    `).run(approval);
  }

  getApprovalForPlan(planId) {
    const row = this.database
      .prepare("SELECT * FROM approvals WHERE plan_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(planId);
    return row ?? null;
  }

  insertExecution(execution) {
    this.database.prepare(`
      INSERT INTO executions (
        id, plan_id, status, before_state_json, recovery_json, result_json, error_json, created_at, finished_at
      ) VALUES (
        @id, @plan_id, @status, @before_state_json, @recovery_json, @result_json, @error_json, @created_at, @finished_at
      )
    `).run(execution);
  }

  getExecution(executionId) {
    const row = this.database.prepare("SELECT * FROM executions WHERE id = ?").get(executionId);
    return row ? hydrateExecution(row) : null;
  }

  insertAuditEvent(event) {
    this.database.prepare(`
      INSERT INTO audit_events (id, request_id, event_type, actor_id, resource_id, payload_json, created_at)
      VALUES (@id, @request_id, @event_type, @actor_id, @resource_id, @payload_json, @created_at)
    `).run(event);
  }

  listAuditEvents(limit = 100) {
    return this.database
      .prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .map((row) => ({
        ...row,
        payload: JSON.parse(row.payload_json),
      }));
  }

  getAuditCount() {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM audit_events").get();
    return row?.count ?? 0;
  }

  pruneOldRecords(cutoff, dryRun = false) {
    const auditCount = this.database
      .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE created_at < ?")
      .get(cutoff).count;
    const executionCount = this.database
      .prepare("SELECT COUNT(*) AS count FROM executions WHERE created_at < ?")
      .get(cutoff).count;

    if (!dryRun) {
      this.database.prepare("DELETE FROM audit_events WHERE created_at < ?").run(cutoff);
      this.database.prepare("DELETE FROM executions WHERE created_at < ?").run(cutoff);
    }

    return {
      cutoff,
      dryRun,
      deletedAuditEvents: auditCount,
      deletedExecutions: executionCount,
    };
  }
}

function hydratePlan(row) {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    actionType: row.action_type,
    target: JSON.parse(row.target_json),
    payload: JSON.parse(row.payload_json),
    normalizedAction: JSON.parse(row.normalized_json),
    schemaFingerprint: row.schema_fingerprint,
    requiresApproval: row.requires_approval === 1,
    approvalReason: row.approval_reason,
    status: row.status,
    warnings: JSON.parse(row.warnings_json),
    requestId: row.request_id,
    callerId: row.caller_id,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    appliedAt: row.applied_at,
  };
}

function hydrateExecution(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    status: row.status,
    beforeState: row.before_state_json ? JSON.parse(row.before_state_json) : null,
    recovery: row.recovery_json ? JSON.parse(row.recovery_json) : null,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error_json ? JSON.parse(row.error_json) : null,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}
