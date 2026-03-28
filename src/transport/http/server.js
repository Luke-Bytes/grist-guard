import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

import { authenticateRequest } from "../../security/auth.js";
import { BrokerError, isBrokerError } from "../../domain/errors.js";

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BrokerError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function routeMatch(pathname, pattern) {
  const pathParts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);

  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index];
    const actual = pathParts[index];

    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }

    if (expected !== actual) {
      return null;
    }
  }

  return params;
}

export function createRequestHandler({
  config,
  logger,
  documentService,
  plannerService,
  executionService,
  auditService,
  metricsService,
  healthService,
}) {
  return async (request, response) => {
    const requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const log = logger.child({ requestId, method: request.method, path: url.pathname });

    try {
      metricsService.increment("http_requests_total");

      if (request.method === "GET" && url.pathname === "/health/live") {
        json(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/health/ready") {
        const readiness = await healthService.getReadiness();
        json(response, readiness.status === "ready" ? 200 : 503, readiness);
        return;
      }

      const actor = authenticateRequest(config, request);

      if (request.method === "GET" && url.pathname === "/v1/documents") {
        const documents = documentService.listAllowedDocuments();
        auditService.record({
          requestId,
          actorId: actor.actorId,
          eventType: "documents.listed",
          payload: { count: documents.length },
        });
        json(response, 200, { requestId, documents });
        return;
      }

      const schemaParams = routeMatch(url.pathname, "/v1/documents/:docId/schema");
      if (request.method === "GET" && schemaParams) {
        const schema = await documentService.getSchema(schemaParams.docId);
        auditService.record({
          requestId,
          actorId: actor.actorId,
          eventType: "schema.read",
          resourceId: schemaParams.docId,
          payload: { docId: schemaParams.docId },
        });
        json(response, 200, { requestId, schema });
        return;
      }

      const sampleParams = routeMatch(url.pathname, "/v1/documents/:docId/tables/:tableId/sample");
      if (request.method === "GET" && sampleParams) {
        const sample = await documentService.getTableSample(sampleParams.docId, sampleParams.tableId, Object.fromEntries(url.searchParams.entries()));
        auditService.record({
          requestId,
          actorId: actor.actorId,
          eventType: "table.sample_read",
          resourceId: `${sampleParams.docId}:${sampleParams.tableId}`,
          payload: { docId: sampleParams.docId, tableId: sampleParams.tableId },
        });
        json(response, 200, { requestId, sample });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/plans") {
        const body = await readJsonBody(request);
        const plan = await plannerService.createPlan(body, {
          requestId,
          actorId: actor.actorId,
        });
        metricsService.increment("plans_created");
        if (plan.requiresApproval) {
          metricsService.increment("plans_requiring_approval");
        }
        auditService.record({
          requestId,
          actorId: actor.actorId,
          eventType: "plan.created",
          resourceId: plan.id,
          payload: {
            actionType: plan.actionType,
            docId: plan.target.docId,
            tableId: plan.target.tableId,
            status: plan.status,
          },
        });
        json(response, 201, { requestId, plan });
        return;
      }

      const approveParams = routeMatch(url.pathname, "/v1/plans/:planId/approve");
      if (request.method === "POST" && approveParams) {
        const body = await readJsonBody(request);
        const plan = executionService.approvePlan(approveParams.planId, actor.actorId, body.comment);
        metricsService.increment("plans_approved");
        auditService.record({
          requestId,
          actorId: actor.actorId,
          eventType: "plan.approved",
          resourceId: plan.id,
          payload: { planId: plan.id },
        });
        json(response, 200, { requestId, plan });
        return;
      }

      const applyParams = routeMatch(url.pathname, "/v1/plans/:planId/apply");
      if (request.method === "POST" && applyParams) {
        const execution = await executionService.applyPlan(applyParams.planId);
        auditService.record({
          requestId,
          actorId: actor.actorId,
          eventType: "plan.applied",
          resourceId: applyParams.planId,
          payload: { planId: applyParams.planId, executionId: execution.id },
        });
        json(response, 200, { requestId, execution });
        return;
      }

      const planParams = routeMatch(url.pathname, "/v1/plans/:planId");
      if (request.method === "GET" && planParams) {
        const plan = executionService.getPlan(planParams.planId);
        json(response, 200, { requestId, plan });
        return;
      }

      const executionParams = routeMatch(url.pathname, "/v1/executions/:executionId");
      if (request.method === "GET" && executionParams) {
        const execution = executionService.getExecution(executionParams.executionId);
        json(response, 200, { requestId, execution });
        return;
      }

      const recoveryParams = routeMatch(url.pathname, "/v1/executions/:executionId/recovery");
      if (request.method === "GET" && recoveryParams) {
        const execution = executionService.getExecution(recoveryParams.executionId);
        json(response, 200, { requestId, recovery: execution.recovery });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/audit") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
        const audit = auditService.list(Number.isFinite(limit) ? Math.min(limit, 200) : 100);
        json(response, 200, { requestId, audit });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/metrics") {
        json(response, 200, { requestId, metrics: metricsService.snapshot() });
        return;
      }

      throw new BrokerError(404, "not_found", "Route not found");
    } catch (error) {
      metricsService.increment("http_requests_failed");
      const statusCode = isBrokerError(error) ? error.statusCode : 500;
      const code = isBrokerError(error) ? error.code : "internal_error";
      const message = isBrokerError(error) ? error.message : "Internal server error";

      log.error("request_failed", {
        code,
        statusCode,
        error: error.stack ?? error.message,
      });

      json(response, statusCode, {
        requestId,
        error: {
          code,
          message,
          details: isBrokerError(error) ? error.details : undefined,
        },
      });
    }
  };
}

export function createHttpServer(dependencies) {
  return createServer(createRequestHandler(dependencies));
}
