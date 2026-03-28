import { createHash, randomUUID } from "node:crypto";

import { ACTION_TYPES, ALLOWED_COLUMN_TYPES } from "./constants.js";
import { BrokerError } from "./errors.js";

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const SIMPLE_FORMULA_PATTERN = /^[A-Za-z0-9_$().,+\-/* <>=!:'"\[\]]+$/;

function assertObject(value, field) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BrokerError(400, "invalid_payload", `${field} must be an object`);
  }
}

function assertString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BrokerError(400, "invalid_payload", `${field} must be a non-empty string`);
  }
}

function assertIdentifier(value, field) {
  assertString(value, field);
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new BrokerError(
      400,
      "invalid_identifier",
      `${field} must start with a letter and contain only letters, digits, or underscores`,
    );
  }
}

function assertColumnType(type) {
  if (!ALLOWED_COLUMN_TYPES.has(type)) {
    throw new BrokerError(
      400,
      "invalid_column_type",
      `column type ${type} is not allowed in v1`,
    );
  }
}

function validateColumn(column) {
  assertObject(column, "column");
  assertIdentifier(column.id, "column.id");
  assertColumnType(column.type);

  if (column.formula !== undefined) {
    validateFormulaText(column.formula);
  }

  return {
    id: column.id,
    type: column.type,
    formula: column.formula,
    isFormula: column.isFormula === true,
  };
}

function validateRows(rows, maxRows, actionType) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BrokerError(400, "invalid_payload", "rows must be a non-empty array");
  }

  if (rows.length > maxRows) {
    throw new BrokerError(400, "row_limit_exceeded", `${actionType} exceeds row limit of ${maxRows}`);
  }

  return rows.map((row, index) => {
    assertObject(row, `rows[${index}]`);

    if (actionType === ACTION_TYPES.UPDATE_ROWS) {
      if (!Number.isInteger(row.rowId) || row.rowId <= 0) {
        throw new BrokerError(400, "invalid_payload", `rows[${index}].rowId must be a positive integer`);
      }
    }

    assertObject(row.fields, `rows[${index}].fields`);
    return {
      rowId: row.rowId,
      fields: row.fields,
    };
  });
}

export function validateFormulaText(formula) {
  assertString(formula, "formula");

  const normalized = formula.trim();
  const deniedFragments = ["import ", "__", "exec(", "eval(", "open(", "lookupRecords", "Table.lookup", "\n"];

  if (!SIMPLE_FORMULA_PATTERN.test(normalized)) {
    throw new BrokerError(400, "invalid_formula", "formula contains unsupported characters");
  }

  for (const fragment of deniedFragments) {
    if (normalized.includes(fragment)) {
      throw new BrokerError(400, "invalid_formula", `formula contains forbidden fragment: ${fragment}`);
    }
  }

  return normalized;
}

export function normalizeActionRequest(input, maxRows) {
  assertObject(input, "body");
  assertString(input.actionType, "actionType");
  assertObject(input.target, "target");

  assertString(input.target.docId, "target.docId");

  const actionType = input.actionType;
  const payload = input.payload ?? {};
  const warnings = [];

  switch (actionType) {
    case ACTION_TYPES.CREATE_TABLE: {
      assertIdentifier(input.target.tableId, "target.tableId");
      if (!Array.isArray(payload.columns) || payload.columns.length === 0) {
        throw new BrokerError(400, "invalid_payload", "payload.columns must be a non-empty array");
      }

      return {
        actionType,
        target: {
          docId: input.target.docId,
          tableId: input.target.tableId,
        },
        payload: {
          columns: payload.columns.map(validateColumn),
        },
        warnings,
      };
    }
    case ACTION_TYPES.ADD_COLUMN: {
      assertIdentifier(input.target.tableId, "target.tableId");
      return {
        actionType,
        target: {
          docId: input.target.docId,
          tableId: input.target.tableId,
        },
        payload: {
          column: validateColumn(payload.column),
        },
        warnings,
      };
    }
    case ACTION_TYPES.ADD_ROWS:
    case ACTION_TYPES.UPDATE_ROWS: {
      assertIdentifier(input.target.tableId, "target.tableId");
      return {
        actionType,
        target: {
          docId: input.target.docId,
          tableId: input.target.tableId,
        },
        payload: {
          rows: validateRows(payload.rows, maxRows, actionType),
        },
        warnings,
      };
    }
    case ACTION_TYPES.PROPOSE_FORMULA: {
      assertIdentifier(input.target.tableId, "target.tableId");
      assertIdentifier(input.target.columnId, "target.columnId");
      const normalizedFormula = validateFormulaText(payload.formula);
      warnings.push("Formula changes are approval-gated in v1.");
      return {
        actionType,
        target: {
          docId: input.target.docId,
          tableId: input.target.tableId,
          columnId: input.target.columnId,
        },
        payload: {
          formula: normalizedFormula,
        },
        warnings,
      };
    }
    default:
      throw new BrokerError(400, "unsupported_action", `Unsupported action type: ${actionType}`);
  }
}

export function normalizeIdempotencyKey(value) {
  if (value === undefined || value === null || value === "") {
    return randomUUID();
  }

  assertString(value, "idempotencyKey");
  return value.trim();
}

export function createSchemaFingerprint(schema) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(schema));
  return hash.digest("hex");
}
