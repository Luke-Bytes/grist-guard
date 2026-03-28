import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function createTestConfig(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "grist-guard-"));
  const config = {
    serviceName: "test-broker",
    host: "127.0.0.1",
    port: 0,
    authTokens: new Set(["test-token"]),
    dbPath: join(directory, "broker.sqlite"),
    grist: {
      baseUrl: "http://grist.invalid",
      apiKey: "test-api-key",
    },
    policy: {
      allowDestructive: false,
      autoApplyRowLimit: 50,
      maxPlanRows: 100,
      readSampleLimit: 25,
      requireApprovalForSchema: true,
      requireApprovalForFormulas: true,
      requireRecoveryMarker: true,
      healthcheckTtlMs: 1000,
      retryAttempts: 3,
      retryBaseMs: 1,
      retentionDays: 90,
      allowedDocuments: {
        docA: {
          name: "Doc A",
          tables: {
            Tasks: {
              read: true,
              write: true,
              allowedColumns: ["Title", "Status", "Notes"],
            },
          },
        },
      },
    },
    ...overrides,
  };

  config.cleanup = () => rmSync(directory, { recursive: true, force: true });
  return config;
}

export class FakeGristClient {
  constructor() {
    this.executed = [];
    this.healthChecks = 0;
  }

  async listDocumentSchema(docId) {
    return {
      metadata: { id: docId, name: "Doc" },
      tables: {
        tables: [
          {
            id: "Tasks",
            columns: [{ id: "Title", fields: { type: "Text" } }],
          },
        ],
      },
    };
  }

  async listTableColumns() {
    return {
      columns: [{ id: "Title", fields: { type: "Text" } }],
    };
  }

  async readTableSample(docId, tableId, options) {
    return {
      docId,
      tableId,
      options,
      records: [{ id: 1, fields: { Title: "Example" } }],
    };
  }

  async getSchemaFingerprintPayload(docId, tableId) {
    return {
      docId,
      tableId,
      version: 1,
    };
  }

  async captureRecoveryMarker(docId) {
    return {
      capturedAt: new Date().toISOString(),
      latestSnapshot: { id: `snapshot-${docId}` },
      latestState: { h: `state-${docId}`, n: 1 },
    };
  }

  async checkHealth() {
    this.healthChecks += 1;
    return [{ id: 1, name: "Test Org" }];
  }

  async executePlan(plan) {
    this.executed.push(plan);
    return {
      ok: true,
      planId: plan.id,
    };
  }
}
