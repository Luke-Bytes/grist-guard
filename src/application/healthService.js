import { createNoopLogger } from "../observability/logger.js";

export class HealthService {
  constructor({ config, store, gristClient, metricsService, logger }) {
    this.config = config;
    this.store = store;
    this.gristClient = gristClient;
    this.metricsService = metricsService;
    this.logger = logger ?? createNoopLogger();
    this.cachedReady = null;
  }

  async getReadiness() {
    const now = Date.now();
    if (this.cachedReady && now - this.cachedReady.checkedAtMs < this.config.policy.healthcheckTtlMs) {
      return this.cachedReady.payload;
    }

    const payload = {
      status: "ready",
      checks: {
        config: "ok",
        sqlite: "ok",
        grist: "ok",
      },
    };

    try {
      this.store.getAuditCount();
    } catch (error) {
      payload.status = "degraded";
      payload.checks.sqlite = "error";
      payload.error = { message: error.message };
      this.logger.error("readiness_sqlite_failed", {
        error: error.message,
      });
    }

    if (payload.status === "ready") {
      try {
        await this.gristClient.checkHealth();
        this.metricsService.setGauge("last_grist_health_ok_at", new Date().toISOString());
      } catch (error) {
        payload.status = "degraded";
        payload.checks.grist = "error";
        payload.error = { message: error.message };
        this.logger.warn("readiness_grist_failed", {
          error: error.message,
          guidance: "Check GRIST_BASE_URL connectivity and GRIST_API_KEY validity",
        });
      }
    }

    this.cachedReady = {
      checkedAtMs: now,
      payload,
    };

    return payload;
  }
}
