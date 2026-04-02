import { randomUUID } from "node:crypto";

import { EXECUTION_STATUS, PLAN_STATUS } from "../domain/constants.js";
import { BrokerError } from "../domain/errors.js";
import { createSchemaFingerprint } from "../domain/validation.js";
import { createNoopLogger } from "../observability/logger.js";
import { withRetry } from "./retry.js";

export class ExecutionService {
  constructor({ config, store, gristClient, lockManager, metricsService, logger }) {
    this.config = config;
    this.store = store;
    this.gristClient = gristClient;
    this.lockManager = lockManager;
    this.metricsService = metricsService;
    this.logger = logger ?? createNoopLogger();
  }

  getPlan(planId) {
    const plan = this.store.getPlan(planId);
    if (!plan) {
      throw new BrokerError(404, "plan_not_found", `Plan ${planId} was not found`);
    }

    return plan;
  }

  approvePlan(planId, actorId, comment) {
    const plan = this.getPlan(planId);
    if (plan.status === PLAN_STATUS.APPLIED) {
      throw new BrokerError(409, "plan_already_applied", "Applied plans cannot be re-approved");
    }

    const approval = {
      id: randomUUID(),
      plan_id: plan.id,
      approver_id: actorId,
      decision: "approved",
      comment: comment ?? null,
      created_at: new Date().toISOString(),
    };

    this.store.insertApproval(approval);
    this.store.updatePlanStatus(planId, PLAN_STATUS.APPROVED, "approved_at", approval.created_at);
    this.logger.info("plan_approved", {
      planId,
      actorId,
      commentProvided: Boolean(comment),
    });
    return this.getPlan(planId);
  }

  async applyPlan(planId) {
    const plan = this.getPlan(planId);

    if (plan.requiresApproval && plan.status !== PLAN_STATUS.APPROVED) {
      throw new BrokerError(409, "approval_required", "Plan requires approval before apply");
    }

    return this.lockManager.withDocumentLock(plan.target.docId, async () => {
      const latestSchema = await this.gristClient.getSchemaFingerprintPayload(plan.target.docId, plan.target.tableId);
      const latestFingerprint = createSchemaFingerprint(latestSchema);

      let recovery;
      try {
        recovery = await this.gristClient.captureRecoveryMarker(plan.target.docId);
      } catch (error) {
        if (this.config.policy.requireRecoveryMarker) {
          this.logger.error("recovery_capture_failed", {
            planId: plan.id,
            docId: plan.target.docId,
            error: error.message,
          });
          throw new BrokerError(503, "recovery_capture_failed", `Failed to capture recovery marker: ${error.message}`);
        }

        recovery = {
          capturedAt: new Date().toISOString(),
          degraded: true,
          error: error.message,
        };
        this.logger.warn("recovery_capture_degraded", {
          planId: plan.id,
          docId: plan.target.docId,
          error: error.message,
        });
      }

      if (latestFingerprint !== plan.schemaFingerprint) {
        this.metricsService.increment("schema_drift_failures");
        this.logger.warn("schema_drift_detected", {
          planId: plan.id,
          docId: plan.target.docId,
          tableId: plan.target.tableId,
        });
        throw new BrokerError(409, "schema_drift_detected", "Live schema changed since plan creation");
      }

      const executionId = randomUUID();
      const createdAt = new Date().toISOString();

      try {
        const result = await withRetry(
          () => this.gristClient.executePlan(plan),
          {
            attempts: this.config.policy.retryAttempts,
            baseDelayMs: this.config.policy.retryBaseMs,
            shouldRetry(error) {
              return error.retryable === true;
            },
            onRetry: (error, attempt) => {
              this.metricsService.increment("grist_retries");
              this.logger.warn("grist_retry_scheduled", {
                planId: plan.id,
                docId: plan.target.docId,
                tableId: plan.target.tableId,
                attempt,
                error: error.message,
              });
            },
          },
        );
        this.store.insertExecution({
          id: executionId,
          plan_id: plan.id,
          status: EXECUTION_STATUS.SUCCEEDED,
          before_state_json: JSON.stringify({ schemaFingerprint: latestFingerprint }),
          recovery_json: JSON.stringify(recovery),
          result_json: JSON.stringify(result),
          error_json: null,
          created_at: createdAt,
          finished_at: new Date().toISOString(),
        });
        this.store.updatePlanStatus(plan.id, PLAN_STATUS.APPLIED, "applied_at", new Date().toISOString());
        this.metricsService.increment("applies_succeeded");
        this.logger.info("plan_applied", {
          planId: plan.id,
          executionId,
          docId: plan.target.docId,
          tableId: plan.target.tableId,
          actionType: plan.actionType,
        });
      } catch (error) {
        this.store.insertExecution({
          id: executionId,
          plan_id: plan.id,
          status: EXECUTION_STATUS.FAILED,
          before_state_json: JSON.stringify({ schemaFingerprint: latestFingerprint }),
          recovery_json: JSON.stringify(recovery),
          result_json: null,
          error_json: JSON.stringify({
            message: error.message,
            code: error.code ?? "execution_failed",
          }),
          created_at: createdAt,
          finished_at: new Date().toISOString(),
        });
        this.metricsService.increment("applies_failed");
        this.logger.error("plan_apply_failed", {
          planId: plan.id,
          executionId,
          docId: plan.target.docId,
          tableId: plan.target.tableId,
          actionType: plan.actionType,
          code: error.code ?? "execution_failed",
          error: error.message,
        });
        throw error;
      }

      return this.store.getExecution(executionId);
    });
  }

  getExecution(executionId) {
    const execution = this.store.getExecution(executionId);
    if (!execution) {
      throw new BrokerError(404, "execution_not_found", `Execution ${executionId} was not found`);
    }

    return execution;
  }
}
