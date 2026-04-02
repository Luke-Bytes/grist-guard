import { loadConfig } from "./config/loadConfig.js";
import { createLogger } from "./observability/logger.js";
import { SqliteStore } from "./persistence/sqlite/database.js";
import { GristClient } from "./integrations/grist/gristClient.js";
import { DocumentService } from "./application/documentService.js";
import { PlannerService } from "./application/plannerService.js";
import { ExecutionService } from "./application/executionService.js";
import { AuditService } from "./application/auditService.js";
import { MetricsService } from "./application/metricsService.js";
import { HealthService } from "./application/healthService.js";
import { ExecutionLockManager } from "./application/executionLockManager.js";
import { RetentionService } from "./application/retentionService.js";
import { createHttpServer } from "./transport/http/server.js";

export function createApp(customConfig, overrides = {}) {
  const config = customConfig ?? loadConfig();
  const logger = createLogger({ service: config.serviceName });
  const store = overrides.store ?? new SqliteStore(config.dbPath);
  const gristClient = overrides.gristClient ?? new GristClient(config.grist);
  const metricsService = overrides.metricsService ?? new MetricsService();
  const lockManager = overrides.lockManager ?? new ExecutionLockManager();
  const documentService = new DocumentService({ config, gristClient, logger: logger.child({ component: "document_service" }) });
  const plannerService = new PlannerService({
    config,
    store,
    gristClient,
    logger: logger.child({ component: "planner_service" }),
  });
  const executionService = new ExecutionService({
    config,
    store,
    gristClient,
    lockManager,
    metricsService,
    logger: logger.child({ component: "execution_service" }),
  });
  const auditService = new AuditService({ store });
  const healthService = new HealthService({
    config,
    store,
    gristClient,
    metricsService,
    logger: logger.child({ component: "health_service" }),
  });
  const retentionService = new RetentionService({ config, store });
  const server = createHttpServer({
    config,
    logger,
    documentService,
    plannerService,
    executionService,
    auditService,
    metricsService,
    healthService,
  });

  return {
    config,
    logger,
    store,
    documentService,
    plannerService,
    executionService,
    auditService,
    healthService,
    metricsService,
    retentionService,
    server,
    close() {
      server.close();
      store.close();
    },
  };
}
