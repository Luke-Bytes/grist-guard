import { assertReadAllowed, listAllowedDocuments } from "../domain/policy.js";
import { BrokerError, isBrokerError } from "../domain/errors.js";
import { createNoopLogger } from "../observability/logger.js";

function isGristViewAccessError(error) {
  return isBrokerError(error) &&
    error.code === "grist_request_failed" &&
    error.statusCode === 403 &&
    error.message.includes("No view access");
}

function wrapGristViewAccessError(docId, error) {
  if (!isGristViewAccessError(error)) {
    throw error;
  }

  throw new BrokerError(
    502,
    "grist_doc_inaccessible",
    `Grist denied view access to document ${docId}. Verify the configured GRIST_API_KEY can open this document and that BROKER_ALLOWED_DOCUMENTS_JSON uses the correct Grist document ID.`,
    { docId },
  );
}

export class DocumentService {
  constructor({ config, gristClient, logger }) {
    this.config = config;
    this.gristClient = gristClient;
    this.logger = logger ?? createNoopLogger();
  }

  listAllowedDocuments() {
    return listAllowedDocuments(this.config);
  }

  async getSchema(docId) {
    assertReadAllowed(this.config, docId);
    try {
      return await this.gristClient.listDocumentSchema(docId);
    } catch (error) {
      if (isGristViewAccessError(error)) {
        this.logger.warn("grist_document_inaccessible", {
          docId,
          guidance: "Verify GRIST_API_KEY document access and BROKER_ALLOWED_DOCUMENTS_JSON docId values",
        });
      }
      wrapGristViewAccessError(docId, error);
    }
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

    try {
      return await this.gristClient.readTableSample(docId, tableId, {
        limit: boundedLimit,
        filter,
        sort,
      });
    } catch (error) {
      if (isGristViewAccessError(error)) {
        this.logger.warn("grist_document_inaccessible", {
          docId,
          tableId,
          guidance: "Verify GRIST_API_KEY document access and BROKER_ALLOWED_DOCUMENTS_JSON docId values",
        });
      }
      wrapGristViewAccessError(docId, error);
    }
  }
}
