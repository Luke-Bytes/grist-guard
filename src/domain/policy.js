import { ACTION_TYPES } from "./constants.js";
import { BrokerError } from "./errors.js";

function getDocumentPolicy(config, docId) {
  return config.policy.allowedDocuments[docId];
}

export function listAllowedDocuments(config) {
  return Object.entries(config.policy.allowedDocuments).map(([docId, policy]) => ({
    docId,
    name: policy.name ?? docId,
    tables: Object.keys(policy.tables ?? {}),
  }));
}

export function assertDocumentAllowed(config, docId) {
  const policy = getDocumentPolicy(config, docId);
  if (!policy) {
    throw new BrokerError(403, "document_not_allowed", `Document ${docId} is not allowed`);
  }

  return policy;
}

export function assertReadAllowed(config, docId, tableId) {
  const documentPolicy = assertDocumentAllowed(config, docId);
  if (!tableId) {
    return documentPolicy;
  }

  const tablePolicy = documentPolicy.tables?.[tableId];
  if (!tablePolicy?.read) {
    throw new BrokerError(403, "table_not_readable", `Read access to ${tableId} is not allowed`);
  }

  return tablePolicy;
}

export function assertWriteAllowed(config, action) {
  const documentPolicy = assertDocumentAllowed(config, action.target.docId);

  if (action.actionType === ACTION_TYPES.CREATE_TABLE) {
    return documentPolicy;
  }

  const tablePolicy = documentPolicy.tables?.[action.target.tableId];
  if (!tablePolicy?.write) {
    throw new BrokerError(403, "table_not_writable", `Write access to ${action.target.tableId} is not allowed`);
  }

  if (action.actionType === ACTION_TYPES.ADD_COLUMN || action.actionType === ACTION_TYPES.PROPOSE_FORMULA) {
    return tablePolicy;
  }

  const allowedColumns = new Set(tablePolicy.allowedColumns ?? []);

  for (const row of action.payload.rows) {
    for (const columnId of Object.keys(row.fields)) {
      if (!allowedColumns.has(columnId)) {
        throw new BrokerError(
          403,
          "column_not_writable",
          `Column ${columnId} is not allowed for writes in ${action.target.tableId}`,
        );
      }
    }
  }

  return tablePolicy;
}

export function determineApprovalRequirement(config, action) {
  if (action.actionType === ACTION_TYPES.CREATE_TABLE || action.actionType === ACTION_TYPES.ADD_COLUMN) {
    return {
      required: config.policy.requireApprovalForSchema,
      reason: "schema_change",
    };
  }

  if (action.actionType === ACTION_TYPES.PROPOSE_FORMULA) {
    return {
      required: config.policy.requireApprovalForFormulas,
      reason: "formula_change",
    };
  }

  if (action.payload.rows.length > config.policy.autoApplyRowLimit) {
    return {
      required: true,
      reason: "row_count_threshold",
    };
  }

  return {
    required: false,
    reason: null,
  };
}
