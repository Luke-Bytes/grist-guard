import type { BrokerClient } from "../broker/contracts.js";
import { createDeterministicIdempotencyKey } from "../broker/idempotency.js";
import { pollExecutionUntilSettled } from "../broker/polling.js";
import type { GristGuardPluginConfig } from "../types/config.js";
import {
  assertNonEmptyString,
  assertPositiveInteger,
  normalizeExecutionResult,
  normalizePlanResult,
  toolText,
  type PluginTool,
} from "./common.js";

interface ToolContextLike {
  sessionId?: string;
}

function getSessionId(toolCallId: string, context: ToolContextLike | undefined) {
  return context?.sessionId ?? toolCallId;
}

function validateFieldsObject(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }

  return value as Record<string, unknown>;
}

export function buildWriteTools(client: BrokerClient, config: GristGuardPluginConfig): PluginTool[] {
  return [
    {
      name: "grist_plan_add_rows",
      description: "Create an add_rows plan through the broker. Use only after reading schema and sample rows.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          docId: { type: "string", minLength: 1 },
          tableId: { type: "string", minLength: 1 },
          rows: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                fields: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              required: ["fields"],
            },
          },
        },
        required: ["docId", "tableId", "rows"],
      },
      execute: async (
        toolCallId: string,
        params: { docId: string; tableId: string; rows: Array<{ fields: Record<string, unknown> }> },
        context?: ToolContextLike,
      ) => {
        const docId = assertNonEmptyString(params.docId, "docId");
        const tableId = assertNonEmptyString(params.tableId, "tableId");
        const rows = params.rows.map((row, index) => ({
          fields: validateFieldsObject(row?.fields, `rows[${index}].fields`),
        }));
        const payload = { rows };
        const idempotencyKey = createDeterministicIdempotencyKey({
          sessionId: getSessionId(toolCallId, context),
          toolName: "grist_plan_add_rows",
          target: { docId, tableId },
          payload,
        });
        const response = await client.createPlan({
          actionType: "add_rows",
          target: { docId, tableId },
          payload,
          idempotencyKey,
        });
        return toolText({
          requestId: response.requestId,
          idempotencyKey,
          ...normalizePlanResult(response.requestId, response.plan),
        });
      },
    },
    {
      name: "grist_plan_update_rows",
      description: "Create an update_rows plan through the broker. Use row ids from a prior read, then wait for human approval if required.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          docId: { type: "string", minLength: 1 },
          tableId: { type: "string", minLength: 1 },
          rows: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                rowId: { type: "integer", minimum: 1 },
                fields: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              required: ["rowId", "fields"],
            },
          },
        },
        required: ["docId", "tableId", "rows"],
      },
      execute: async (
        toolCallId: string,
        params: { docId: string; tableId: string; rows: Array<{ rowId: number; fields: Record<string, unknown> }> },
        context?: ToolContextLike,
      ) => {
        const docId = assertNonEmptyString(params.docId, "docId");
        const tableId = assertNonEmptyString(params.tableId, "tableId");
        const rows = params.rows.map((row, index) => ({
          rowId: assertPositiveInteger(row?.rowId, `rows[${index}].rowId`),
          fields: validateFieldsObject(row?.fields, `rows[${index}].fields`),
        }));
        const payload = { rows };
        const idempotencyKey = createDeterministicIdempotencyKey({
          sessionId: getSessionId(toolCallId, context),
          toolName: "grist_plan_update_rows",
          target: { docId, tableId },
          payload,
        });
        const response = await client.createPlan({
          actionType: "update_rows",
          target: { docId, tableId },
          payload,
          idempotencyKey,
        });
        return toolText({
          requestId: response.requestId,
          idempotencyKey,
          ...normalizePlanResult(response.requestId, response.plan),
        });
      },
    },
    {
      name: "grist_get_plan",
      description: "Read current broker plan state, including approval requirement, warnings, and schema fingerprint.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          planId: { type: "string", minLength: 1 },
        },
        required: ["planId"],
      },
      execute: async (_toolCallId: string, params: { planId: string }) => {
        const response = await client.getPlan(assertNonEmptyString(params.planId, "planId"));
        return toolText(normalizePlanResult(response.requestId, response.plan));
      },
    },
    {
      name: "grist_apply_plan",
      description: "Apply an already approved or auto-approved broker plan. Never assume success until execution confirms it.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          planId: { type: "string", minLength: 1 },
        },
        required: ["planId"],
      },
      execute: async (_toolCallId: string, params: { planId: string }) => {
        const planId = assertNonEmptyString(params.planId, "planId");
        const response = await client.applyPlan(planId);
        const polled = await pollExecutionUntilSettled(
          client,
          response.execution.id,
          config.applyPollMs,
          config.applyTimeoutMs,
        );
        return toolText({
          requestId: response.requestId,
          timedOut: polled.timedOut,
          ...normalizeExecutionResult(response.requestId, polled.execution),
        });
      },
    },
    {
      name: "grist_get_execution",
      description: "Read execution status for a previously applied plan.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          executionId: { type: "string", minLength: 1 },
        },
        required: ["executionId"],
      },
      execute: async (_toolCallId: string, params: { executionId: string }) => {
        const response = await client.getExecution(assertNonEmptyString(params.executionId, "executionId"));
        return toolText(normalizeExecutionResult(response.requestId, response.execution));
      },
    },
    {
      name: "grist_get_recovery",
      description: "Read broker recovery metadata captured before plan apply.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          executionId: { type: "string", minLength: 1 },
        },
        required: ["executionId"],
      },
      execute: async (_toolCallId: string, params: { executionId: string }) => {
        const executionId = assertNonEmptyString(params.executionId, "executionId");
        const response = await client.getRecovery(executionId);
        return toolText({
          requestId: response.requestId,
          executionId,
          recovery: response.recovery,
        });
      },
    },
  ];
}
