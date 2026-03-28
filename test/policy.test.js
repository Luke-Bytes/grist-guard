import test from "node:test";
import assert from "node:assert/strict";

import { assertReadAllowed, assertWriteAllowed, listAllowedDocuments } from "../src/domain/policy.js";
import { createTestConfig } from "./test-helpers.js";

test("docId-only allowlist entry grants full document access", () => {
  const config = createTestConfig({
    policy: {
      allowedDocuments: {
        docA: true,
      },
    },
  });

  assert.doesNotThrow(() => {
    assertReadAllowed(config, "docA", "AnyTable");
  });

  assert.doesNotThrow(() => {
    assertWriteAllowed(config, {
      actionType: "add_rows",
      target: { docId: "docA", tableId: "AnyTable" },
      payload: {
        rows: [{ fields: { AnyColumn: "value", OtherColumn: "value" } }],
      },
    });
  });

  const [document] = listAllowedDocuments(config);
  assert.equal(document.fullAccess, true);
  assert.deepEqual(document.tables, ["*"]);

  config.cleanup();
});

test("wildcard table and column rules allow any table and any column within a document", () => {
  const config = createTestConfig({
    policy: {
      allowedDocuments: {
        docA: {
          tables: {
            "*": {
              read: true,
              write: true,
              allowedColumns: ["*"],
            },
          },
        },
      },
    },
  });

  assert.doesNotThrow(() => {
    assertWriteAllowed(config, {
      actionType: "update_rows",
      target: { docId: "docA", tableId: "Whatever" },
      payload: {
        rows: [{ rowId: 1, fields: { Foo: "bar" } }],
      },
    });
  });

  config.cleanup();
});

test("restricted table policy still blocks columns not explicitly allowed", () => {
  const config = createTestConfig();

  assert.throws(() => {
    assertWriteAllowed(config, {
      actionType: "add_rows",
      target: { docId: "docA", tableId: "Tasks" },
      payload: {
        rows: [{ fields: { Forbidden: "nope" } }],
      },
    });
  });

  config.cleanup();
});
