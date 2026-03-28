import type { BrokerExecution, BrokerPlan } from "../broker/contracts.js";

export interface NormalizedPlanResult {
  requestId?: string;
  plan: {
    id: string;
    status: BrokerPlan["status"];
    actionType: BrokerPlan["actionType"];
    target: BrokerPlan["target"];
    requiresApproval: boolean;
    approvalReason: BrokerPlan["approvalReason"];
    warnings: string[];
    schemaFingerprint: string;
    createdAt: string;
    approvedAt: string | null;
    appliedAt: string | null;
  };
}

export interface NormalizedExecutionResult {
  requestId?: string;
  execution: {
    id: BrokerExecution["id"];
    planId: BrokerExecution["planId"];
    status: BrokerExecution["status"];
    createdAt: string;
    finishedAt: string | null;
    result: BrokerExecution["result"];
    error: BrokerExecution["error"];
    recovery: BrokerExecution["recovery"];
  };
}
