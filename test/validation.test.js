import test from "node:test";
import assert from "node:assert/strict";

import { normalizeActionRequest } from "../src/domain/validation.js";

test("formula validation rejects dangerous content", () => {
  assert.throws(() => {
    normalizeActionRequest(
      {
        actionType: "propose_formula",
        target: { docId: "docA", tableId: "Tasks", columnId: "Calc" },
        payload: { formula: "import os" },
      },
      100,
    );
  });
});
