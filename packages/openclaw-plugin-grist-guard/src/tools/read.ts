import type { BrokerClient } from "../broker/contracts.js";
import type { GristGuardPluginConfig } from "../types/config.js";
import { assertNonEmptyString, clampSampleLimit, toolText, type PluginTool } from "./common.js";

export function buildReadTools(client: BrokerClient, config: GristGuardPluginConfig): PluginTool[] {
  return [
    {
      name: "grist_list_documents",
      description: "List broker-allowlisted Grist documents. Use this before choosing a document id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      execute: async () => {
        const response = await client.listDocuments();
        return toolText({
          requestId: response.requestId,
          documents: response.documents.map((document) => ({
            docId: document.docId,
            name: document.name,
            tables: document.tables,
            fullAccess: document.fullAccess,
          })),
        });
      },
    },
    {
      name: "grist_get_schema",
      description: "Read a document schema. Always inspect schema before planning writes.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          docId: { type: "string", minLength: 1 },
        },
        required: ["docId"],
      },
      execute: async (_toolCallId: string, params: { docId: string }) => {
        const docId = assertNonEmptyString(params.docId, "docId");
        const response = await client.getSchema(docId);
        const tables = response.schema.tables?.tables ?? [];
        return toolText({
          requestId: response.requestId,
          schema: {
            docId: response.schema.metadata?.id ?? docId,
            name: response.schema.metadata?.name ?? docId,
            tables: tables.map((table) => ({
              id: table.id,
              columns: table.columns.map((column) => ({
                id: column.id,
                type: column.fields?.type ?? "unknown",
              })),
            })),
          },
        });
      },
    },
    {
      name: "grist_get_sample",
      description: "Read a bounded sample of table rows through the broker. Keep limit small and schema-informed.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          docId: { type: "string", minLength: 1 },
          tableId: { type: "string", minLength: 1 },
          limit: { type: "integer", minimum: 1 },
        },
        required: ["docId", "tableId"],
      },
      execute: async (_toolCallId: string, params: { docId: string; tableId: string; limit?: number }) => {
        const docId = assertNonEmptyString(params.docId, "docId");
        const tableId = assertNonEmptyString(params.tableId, "tableId");
        const limit = clampSampleLimit(params.limit, config);
        const response = await client.getSample(docId, tableId, limit);
        return toolText({
          requestId: response.requestId,
          sample: {
            docId,
            tableId,
            limit,
            rows: response.sample.records,
          },
        });
      },
    },
  ];
}
