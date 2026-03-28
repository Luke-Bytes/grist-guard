export const ACTION_TYPES = {
  CREATE_TABLE: "create_table",
  ADD_COLUMN: "add_column",
  ADD_ROWS: "add_rows",
  UPDATE_ROWS: "update_rows",
  PROPOSE_FORMULA: "propose_formula",
};

export const ALLOWED_COLUMN_TYPES = new Set([
  "Text",
  "Numeric",
  "Integer",
  "Toggle",
  "Date",
  "DateTime",
  "Choice",
]);

export const PLAN_STATUS = {
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
  APPLIED: "applied",
};

export const EXECUTION_STATUS = {
  SUCCEEDED: "succeeded",
  FAILED: "failed",
};
