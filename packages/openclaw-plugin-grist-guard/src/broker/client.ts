import type {
  ApplyPlanResponse,
  ApprovePlanResponse,
  BrokerClient,
  CreatePlanInput,
  CreatePlanResponse,
  GetExecutionResponse,
  GetPlanResponse,
  GetRecoveryResponse,
  GetSampleResponse,
  GetSchemaResponse,
  HealthReadyResponse,
  ListDocumentsResponse,
} from "./contracts.js";

import { createBrokerHttpError } from "./errors.js";

export interface BrokerClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

interface BrokerErrorBody {
  requestId?: string;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  return { controller, timeout };
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export class HttpBrokerClient implements BrokerClient {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #timeoutMs: number;

  constructor({ baseUrl, token, timeoutMs = 5_000 }: BrokerClientOptions) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#token = token;
    this.#timeoutMs = timeoutMs;
  }

  healthReady() {
    return this.#request<HealthReadyResponse>("GET", "/health/ready");
  }

  listDocuments() {
    return this.#request<ListDocumentsResponse>("GET", "/v1/documents");
  }

  getSchema(docId: string) {
    return this.#request<GetSchemaResponse>("GET", `/v1/documents/${encodeURIComponent(docId)}/schema`);
  }

  getSample(docId: string, tableId: string, limit: number) {
    const search = new URLSearchParams({ limit: String(limit) });
    return this.#request<GetSampleResponse>(
      "GET",
      `/v1/documents/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/sample?${search.toString()}`,
    );
  }

  createPlan(input: CreatePlanInput) {
    return this.#request<CreatePlanResponse>("POST", "/v1/plans", input);
  }

  getPlan(planId: string) {
    return this.#request<GetPlanResponse>("GET", `/v1/plans/${encodeURIComponent(planId)}`);
  }

  applyPlan(planId: string) {
    return this.#request<ApplyPlanResponse>("POST", `/v1/plans/${encodeURIComponent(planId)}/apply`, {});
  }

  getExecution(executionId: string) {
    return this.#request<GetExecutionResponse>("GET", `/v1/executions/${encodeURIComponent(executionId)}`);
  }

  getRecovery(executionId: string) {
    return this.#request<GetRecoveryResponse>("GET", `/v1/executions/${encodeURIComponent(executionId)}/recovery`);
  }

  approvePlan(planId: string, comment?: string) {
    return this.#request<ApprovePlanResponse>(
      "POST",
      `/v1/plans/${encodeURIComponent(planId)}/approve`,
      comment ? { comment } : {},
    );
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { controller, timeout } = withTimeout(this.#timeoutMs);

    try {
      const response = await fetch(`${this.#baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.#token}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload: BrokerErrorBody = await parseJson<BrokerErrorBody>(response).catch(() => ({}));
        throw createBrokerHttpError(
          response.status,
          payload.error?.code ?? "broker_http_error",
          payload.error?.message ?? `Broker request failed with status ${response.status}`,
          payload.requestId,
          payload.error?.details,
        );
      }

      return parseJson<T>(response);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw createBrokerHttpError(503, "broker_timeout", error.message);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
