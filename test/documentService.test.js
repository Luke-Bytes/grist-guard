import test from "node:test";
import assert from "node:assert/strict";

import { DocumentService } from "../src/application/documentService.js";
import { createTestConfig, FakeGristClient } from "./test-helpers.js";

test("document service bounds sample reads", async () => {
  const config = createTestConfig();
  const service = new DocumentService({
    config,
    gristClient: new FakeGristClient(),
  });

  const sample = await service.getTableSample("docA", "Tasks", {
    limit: "999",
    filter: "{\"Status\":[\"New\"]}",
    sort: "Title",
  });

  assert.equal(sample.options.limit, 25);
  assert.deepEqual(sample.options.filter, { Status: ["New"] });
  assert.equal(sample.options.sort, "Title");

  config.cleanup();
});
