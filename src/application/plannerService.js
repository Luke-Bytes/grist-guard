import { randomUUID } from "node:crypto";

import { PLAN_STATUS } from "../domain/constants.js";
import { assertWriteAllowed, determineApprovalRequirement } from "../domain/policy.js";
import { createSchemaFingerprint, normalizeActionRequest, normalizeIdempotencyKey } from "../domain/validation.js";

export class PlannerService {
  constructor({ config, store, gristClient }) {
    this.config = config;
    this.store = store;
    this.gristClient = gristClient;
  }

  async createPlan(input, context) {
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const existingPlan = this.store.findPlanByIdempotencyKey(idempotencyKey);
    if (existingPlan) {
      return existingPlan;
    }

    const normalizedAction = normalizeActionRequest(input, this.config.policy.maxPlanRows);
    assertWriteAllowed(this.config, normalizedAction);

    const liveSchema = await this.gristClient.getSchemaFingerprintPayload(
      normalizedAction.target.docId,
      normalizedAction.target.tableId,
    );
    const schemaFingerprint = createSchemaFingerprint(liveSchema);
    const approvalRequirement = determineApprovalRequirement(this.config, normalizedAction);
    const status = approvalRequirement.required ? PLAN_STATUS.PENDING_APPROVAL : PLAN_STATUS.APPROVED;
    const plan = {
      id: randomUUID(),
      idempotency_key: idempotencyKey,
      action_type: normalizedAction.actionType,
      target_json: JSON.stringify(normalizedAction.target),
      payload_json: JSON.stringify(normalizedAction.payload),
      normalized_json: JSON.stringify(normalizedAction),
      schema_fingerprint: schemaFingerprint,
      requiresApproval: approvalRequirement.required,
      approval_reason: approvalRequirement.reason,
      status,
      warnings_json: JSON.stringify(normalizedAction.warnings),
      request_id: context.requestId,
      caller_id: context.actorId,
      created_at: new Date().toISOString(),
    };

    this.store.insertPlan(plan);

    return this.store.getPlan(plan.id);
  }
}
