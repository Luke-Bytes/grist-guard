import {
  BrokerAuthError,
  BrokerConflictError,
  BrokerHttpError,
  BrokerInternalError,
  BrokerPolicyError,
  BrokerUnavailableError,
} from "./contracts.js";

export function createBrokerHttpError(
  statusCode: number,
  code: string,
  message: string,
  requestId?: string,
  details?: unknown,
): BrokerHttpError {
  if (statusCode === 401) {
    return new BrokerAuthError(statusCode, code, message, requestId, details);
  }

  if (statusCode === 403) {
    return new BrokerPolicyError(statusCode, code, message, requestId, details);
  }

  if (statusCode === 409) {
    return new BrokerConflictError(statusCode, code, message, requestId, details);
  }

  if (statusCode === 503) {
    return new BrokerUnavailableError(statusCode, code, message, requestId, details);
  }

  if (statusCode >= 500) {
    return new BrokerInternalError(statusCode, code, message, requestId, details);
  }

  return new BrokerHttpError(statusCode, code, message, requestId, details);
}
