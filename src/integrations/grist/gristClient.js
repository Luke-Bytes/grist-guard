import { ACTION_TYPES } from "../../domain/constants.js";
import { BrokerError } from "../../domain/errors.js";

export class GristClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async listDocumentSchema(docId) {
    const [metadata, tables] = await Promise.all([
      this.request(`/api/docs/${encodeURIComponent(docId)}`),
      this.request(`/api/docs/${encodeURIComponent(docId)}/tables`),
    ]);

    return {
      metadata,
      tables,
    };
  }

  async listTableColumns(docId, tableId) {
    return this.request(`/api/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/columns`);
  }

  async readTableSample(docId, tableId, options) {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit));

    if (options.filter) {
      params.set("filter", JSON.stringify(options.filter));
    }

    if (options.sort) {
      params.set("sort", options.sort);
    }

    return this.request(
      `/api/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/records?${params.toString()}`,
    );
  }

  async getSchemaFingerprintPayload(docId, tableId) {
    const schema = await this.listDocumentSchema(docId);
    if (!tableId) {
      return schema;
    }

    return {
      metadata: schema.metadata,
      table: schema.tables.tables?.find((table) => table.id === tableId) ?? null,
      columns: await this.listTableColumns(docId, tableId),
    };
  }

  async getDocumentSnapshots(docId) {
    return this.request(`/api/docs/${encodeURIComponent(docId)}/snapshots`);
  }

  async getDocumentStates(docId) {
    return this.request(`/api/docs/${encodeURIComponent(docId)}/states`);
  }

  async captureRecoveryMarker(docId) {
    const [snapshots, states] = await Promise.all([
      this.getDocumentSnapshots(docId),
      this.getDocumentStates(docId),
    ]);

    const latestSnapshot = Array.isArray(snapshots) ? (snapshots[0] ?? null) : (snapshots.snapshots?.[0] ?? null);
    const latestState = Array.isArray(states) ? (states[0] ?? null) : (states.states?.[0] ?? null);

    return {
      capturedAt: new Date().toISOString(),
      latestSnapshot,
      latestState,
    };
  }

  async checkHealth() {
    return this.request("/api/orgs");
  }

  async executePlan(plan) {
    const { actionType, target, payload } = plan.normalizedAction;

    switch (actionType) {
      case ACTION_TYPES.CREATE_TABLE:
        return this.request(`/api/docs/${encodeURIComponent(target.docId)}/tables`, {
          method: "POST",
          body: {
            tables: [
              {
                id: target.tableId,
                columns: payload.columns,
              },
            ],
          },
        });
      case ACTION_TYPES.ADD_COLUMN:
        return this.request(
          `/api/docs/${encodeURIComponent(target.docId)}/tables/${encodeURIComponent(target.tableId)}/columns`,
          {
            method: "POST",
            body: {
              columns: [payload.column],
            },
          },
        );
      case ACTION_TYPES.ADD_ROWS:
        return this.request(
          `/api/docs/${encodeURIComponent(target.docId)}/tables/${encodeURIComponent(target.tableId)}/records`,
          {
            method: "POST",
            body: {
              records: payload.rows.map((row) => row.fields),
            },
          },
        );
      case ACTION_TYPES.UPDATE_ROWS:
        return this.request(
          `/api/docs/${encodeURIComponent(target.docId)}/tables/${encodeURIComponent(target.tableId)}/records`,
          {
            method: "PATCH",
            body: {
              records: payload.rows.map((row) => ({
                id: row.rowId,
                fields: row.fields,
              })),
            },
          },
        );
      case ACTION_TYPES.PROPOSE_FORMULA:
        return this.request(
          `/api/docs/${encodeURIComponent(target.docId)}/tables/${encodeURIComponent(target.tableId)}/columns`,
          {
            method: "PATCH",
            body: {
              columns: [
                {
                  id: target.columnId,
                  fields: {
                    formula: payload.formula,
                    isFormula: true,
                  },
                },
              ],
            },
          },
        );
      default:
        throw new BrokerError(500, "unsupported_action", `Executor cannot handle ${actionType}`);
    }
  }

  async request(path, options = {}) {
    let response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (cause) {
      const error = new BrokerError(503, "grist_request_failed", `Grist request failed: ${cause.message}`);
      error.retryable = true;
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      const error = new BrokerError(response.status, "grist_request_failed", `Grist request failed: ${body}`);
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }
}
