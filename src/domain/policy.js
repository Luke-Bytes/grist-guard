import { ACTION_TYPES } from "./constants.js";
import { BrokerError } from "./errors.js";

function getDocumentPolicy(config, docId) {
  return config.policy.allowedDocuments[docId];
}

function isWildcard(value) {
  return value === "*";
}

function hasFullDocumentAccess(policy) {
  if (policy === true || isWildcard(policy)) {
    return true;
  }

  if (!policy || typeof policy !== "object") {
    return false;
  }

  return policy.allowAll === true || policy.tables === undefined || isWildcard(policy.tables);
}

function resolveTablePolicy(documentPolicy, tableId) {
  if (hasFullDocumentAccess(documentPolicy)) {
    return {
      read: true,
      write: true,
      allowedColumns: "*",
      wildcard: true,
    };
  }

  const tables = documentPolicy.tables ?? {};
  return tables[tableId] ?? tables["*"] ?? null;
}

function allowsAllColumns(tablePolicy) {
  if (!tablePolicy || tablePolicy === true || isWildcard(tablePolicy)) {
    return true;
  }

  if (typeof tablePolicy !== "object") {
    return false;
  }

  return tablePolicy.allowedColumns === undefined || isWildcard(tablePolicy.allowedColumns) ||
    (Array.isArray(tablePolicy.allowedColumns) && tablePolicy.allowedColumns.includes("*"));
}

function canReadTable(tablePolicy) {
  if (!tablePolicy || tablePolicy === true || isWildcard(tablePolicy)) {
    return true;
  }

  if (typeof tablePolicy !== "object") {
    return false;
  }

  return tablePolicy.read !== false;
}

function canWriteTable(tablePolicy) {
  if (!tablePolicy || tablePolicy === true || isWildcard(tablePolicy)) {
    return true;
  }

  if (typeof tablePolicy !== "object") {
    return false;
  }

  return tablePolicy.write !== false;
}

export function listAllowedDocuments(config) {
  return Object.entries(config.policy.allowedDocuments).map(([docId, policy]) => {
    const objectPolicy = typeof policy === "object" && policy !== null ? policy : {};
    return {
      docId,
      name: objectPolicy.name ?? docId,
      tables: hasFullDocumentAccess(policy) ? ["*"] : Object.keys(objectPolicy.tables ?? {}),
      fullAccess: hasFullDocumentAccess(policy),
    };
  });
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

  const tablePolicy = resolveTablePolicy(documentPolicy, tableId);
  if (!canReadTable(tablePolicy)) {
    throw new BrokerError(403, "table_not_readable", `Read access to ${tableId} is not allowed`);
  }

  return tablePolicy;
}

export function assertWriteAllowed(config, action) {
  const documentPolicy = assertDocumentAllowed(config, action.target.docId);

  if (action.actionType === ACTION_TYPES.CREATE_TABLE) {
    return documentPolicy;
  }

  const tablePolicy = resolveTablePolicy(documentPolicy, action.target.tableId);
  if (!canWriteTable(tablePolicy)) {
    throw new BrokerError(403, "table_not_writable", `Write access to ${action.target.tableId} is not allowed`);
  }

  if (action.actionType === ACTION_TYPES.ADD_COLUMN || action.actionType === ACTION_TYPES.PROPOSE_FORMULA) {
    return tablePolicy;
  }

  if (allowsAllColumns(tablePolicy)) {
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
