export const actionTypes = ["add_rows", "update_rows"] as const;
export type ActionType = (typeof actionTypes)[number];

export const planStatuses = ["pending_approval", "approved", "rejected", "applied"] as const;
export type PlanStatus = (typeof planStatuses)[number];

export const executionStatuses = ["succeeded", "failed"] as const;
export type ExecutionStatus = (typeof executionStatuses)[number];

export interface BrokerErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface BrokerEnvelope {
  requestId: string;
  error?: BrokerErrorPayload;
}

export interface BrokerDocument {
  docId: string;
  name: string;
  tables: string[];
  fullAccess: boolean;
}

export interface ListDocumentsResponse extends BrokerEnvelope {
  documents: BrokerDocument[];
}

export interface BrokerSchemaColumn {
  id: string;
  fields?: {
    type?: string;
    [key: string]: unknown;
  };
}

export interface BrokerSchemaTable {
  id: string;
  columns: BrokerSchemaColumn[];
}

export interface BrokerSchema {
  metadata?: {
    id?: string;
    name?: string;
    [key: string]: unknown;
  };
  tables?: {
    tables?: BrokerSchemaTable[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface GetSchemaResponse extends BrokerEnvelope {
  schema: BrokerSchema;
}

export interface BrokerSampleRecord {
  id?: number | string;
  fields: Record<string, unknown>;
}

export interface BrokerSample {
  docId: string;
  tableId: string;
  options?: {
    limit?: number;
    filter?: unknown;
    sort?: string;
  };
  records: BrokerSampleRecord[];
  [key: string]: unknown;
}

export interface GetSampleResponse extends BrokerEnvelope {
  sample: BrokerSample;
}

export interface AddRowsInput {
  actionType: "add_rows";
  target: {
    docId: string;
    tableId: string;
  };
  payload: {
    rows: Array<{
      fields: Record<string, unknown>;
    }>;
  };
  idempotencyKey: string;
}

export interface UpdateRowsInput {
  actionType: "update_rows";
  target: {
    docId: string;
    tableId: string;
  };
  payload: {
    rows: Array<{
      rowId: number;
      fields: Record<string, unknown>;
    }>;
  };
  idempotencyKey: string;
}

export type CreatePlanInput = AddRowsInput | UpdateRowsInput;

export interface BrokerPlan {
  id: string;
  idempotencyKey: string;
  actionType: ActionType;
  target: {
    docId: string;
    tableId: string;
  };
  payload: {
    rows: Array<{
      rowId?: number;
      fields: Record<string, unknown>;
    }>;
  };
  normalizedAction: {
    actionType: ActionType;
    target: {
      docId: string;
      tableId: string;
    };
    payload: BrokerPlan["payload"];
    warnings: string[];
  };
  schemaFingerprint: string;
  requiresApproval: boolean;
  approvalReason: string | null;
  status: PlanStatus;
  warnings: string[];
  requestId: string;
  callerId: string;
  createdAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
}

export interface CreatePlanResponse extends BrokerEnvelope {
  plan: BrokerPlan;
}

export interface GetPlanResponse extends BrokerEnvelope {
  plan: BrokerPlan;
}

export interface BrokerExecution {
  id: string;
  planId: string;
  status: ExecutionStatus;
  beforeState: unknown;
  recovery: unknown;
  result: unknown;
  error: unknown;
  createdAt: string;
  finishedAt: string | null;
}

export interface ApplyPlanResponse extends BrokerEnvelope {
  execution: BrokerExecution;
}

export interface GetExecutionResponse extends BrokerEnvelope {
  execution: BrokerExecution;
}

export interface GetRecoveryResponse extends BrokerEnvelope {
  recovery: unknown;
}

export interface ApprovePlanResponse extends BrokerEnvelope {
  plan: BrokerPlan;
}

export interface HealthReadyResponse {
  status: "ready" | "not_ready" | string;
  checks?: Record<string, unknown>;
  [key: string]: unknown;
}

export class BrokerHttpError extends Error {
  override readonly name: string = "BrokerHttpError";

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export class BrokerAuthError extends BrokerHttpError {
  override readonly name = "BrokerAuthError";
}

export class BrokerPolicyError extends BrokerHttpError {
  override readonly name = "BrokerPolicyError";
}

export class BrokerConflictError extends BrokerHttpError {
  override readonly name = "BrokerConflictError";
}

export class BrokerUnavailableError extends BrokerHttpError {
  override readonly name = "BrokerUnavailableError";
}

export class BrokerInternalError extends BrokerHttpError {
  override readonly name = "BrokerInternalError";
}

export interface BrokerClient {
  healthReady(): Promise<HealthReadyResponse>;
  listDocuments(): Promise<ListDocumentsResponse>;
  getSchema(docId: string): Promise<GetSchemaResponse>;
  getSample(docId: string, tableId: string, limit: number): Promise<GetSampleResponse>;
  createPlan(input: CreatePlanInput): Promise<CreatePlanResponse>;
  getPlan(planId: string): Promise<GetPlanResponse>;
  applyPlan(planId: string): Promise<ApplyPlanResponse>;
  getExecution(executionId: string): Promise<GetExecutionResponse>;
  getRecovery(executionId: string): Promise<GetRecoveryResponse>;
  approvePlan(planId: string, comment?: string): Promise<ApprovePlanResponse>;
}
