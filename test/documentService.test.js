import test from "node:test";
import assert from "node:assert/strict";

import { DocumentService } from "../src/application/documentService.js";
import { BrokerError } from "../src/domain/errors.js";
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

test("document service surfaces a targeted error when Grist denies document view access", async () => {
  const config = createTestConfig();
  const gristClient = new FakeGristClient();
  gristClient.listDocumentSchema = async () => {
    throw new BrokerError(403, "grist_request_failed", "Grist request failed: {\"error\":\"No view access\"}");
  };

  const service = new DocumentService({
    config,
    gristClient,
  });

  await assert.rejects(
    service.getSchema("docA"),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.code, "grist_doc_inaccessible");
      assert.match(error.message, /GRIST_API_KEY/);
      assert.deepEqual(error.details, { docId: "docA" });
      return true;
    },
  );

  config.cleanup();
});

test("document service maps sample read view-access failures to the same broker error", async () => {
  const config = createTestConfig();
  const gristClient = new FakeGristClient();
  gristClient.readTableSample = async () => {
    throw new BrokerError(403, "grist_request_failed", "Grist request failed: {\"error\":\"No view access\"}");
  };

  const service = new DocumentService({
    config,
    gristClient,
  });

  await assert.rejects(
    service.getTableSample("docA", "Tasks", {}),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(error.code, "grist_doc_inaccessible");
      assert.deepEqual(error.details, { docId: "docA" });
      return true;
    },
  );

  config.cleanup();
});
