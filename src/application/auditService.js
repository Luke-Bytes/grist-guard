import { randomUUID } from "node:crypto";

export class AuditService {
  constructor({ store }) {
    this.store = store;
  }

  record({ requestId, actorId, eventType, resourceId, payload }) {
    this.store.insertAuditEvent({
      id: randomUUID(),
      request_id: requestId,
      event_type: eventType,
      actor_id: actorId,
      resource_id: resourceId ?? null,
      payload_json: JSON.stringify(payload ?? {}),
      created_at: new Date().toISOString(),
    });
  }

  list(limit) {
    return this.store.listAuditEvents(limit);
  }
}
