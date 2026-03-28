import type { BrokerExecution, BrokerPlan } from "../broker/contracts.js";
import type { GristGuardPluginConfig } from "../types/config.js";
import type { NormalizedExecutionResult, NormalizedPlanResult } from "../types/results.js";

export function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value.trim();
}

export function assertPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return Number(value);
}

export function clampSampleLimit(limit: unknown, config: GristGuardPluginConfig): number {
  if (limit === undefined) {
    return config.sampleMaxRows;
  }

  return Math.min(assertPositiveInteger(limit, "limit"), config.sampleMaxRows);
}

export function normalizePlanResult(requestId: string | undefined, plan: BrokerPlan): NormalizedPlanResult {
  return {
    requestId,
    plan: {
      id: plan.id,
      status: plan.status,
      actionType: plan.actionType,
      target: plan.target,
      requiresApproval: plan.requiresApproval,
      approvalReason: plan.approvalReason,
      warnings: plan.warnings,
      schemaFingerprint: plan.schemaFingerprint,
      createdAt: plan.createdAt,
      approvedAt: plan.approvedAt,
      appliedAt: plan.appliedAt,
    },
  };
}

export function normalizeExecutionResult(
  requestId: string | undefined,
  execution: BrokerExecution,
): NormalizedExecutionResult {
  return {
    requestId,
    execution: {
      id: execution.id,
      planId: execution.planId,
      status: execution.status,
      createdAt: execution.createdAt,
      finishedAt: execution.finishedAt,
      result: execution.result,
      error: execution.error,
      recovery: execution.recovery,
    },
  };
}

export function toolText(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

export interface PluginTool {
  name: string;
  description: string;
  parameters: unknown;
  execute: (...args: any[]) => Promise<ReturnType<typeof toolText>>;
}
