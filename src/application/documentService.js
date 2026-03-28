import { assertReadAllowed, listAllowedDocuments } from "../domain/policy.js";
import { BrokerError } from "../domain/errors.js";

export class DocumentService {
  constructor({ config, gristClient }) {
    this.config = config;
    this.gristClient = gristClient;
  }

  listAllowedDocuments() {
    return listAllowedDocuments(this.config);
  }

  async getSchema(docId) {
    assertReadAllowed(this.config, docId);
    return this.gristClient.listDocumentSchema(docId);
  }

  async getTableSample(docId, tableId, query) {
    assertReadAllowed(this.config, docId, tableId);

    const limit = Number.parseInt(query.limit ?? "", 10);
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), this.config.policy.readSampleLimit)
      : this.config.policy.readSampleLimit;

    let filter;
    if (query.filter) {
      try {
        filter = JSON.parse(query.filter);
      } catch {
        throw new BrokerError(400, "invalid_filter", "filter must be valid JSON");
      }
    }

    const sort = typeof query.sort === "string" ? query.sort : undefined;

    return this.gristClient.readTableSample(docId, tableId, {
      limit: boundedLimit,
      filter,
      sort,
    });
  }
}
