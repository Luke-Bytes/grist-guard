import { BrokerError } from "../domain/errors.js";

export function authenticateRequest(config, request) {
  const authorization = request.headers.authorization ?? "";

  if (!authorization.startsWith("Bearer ")) {
    throw new BrokerError(401, "missing_auth", "Bearer token is required");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!config.authTokens.has(token)) {
    throw new BrokerError(401, "invalid_auth", "Broker token is invalid");
  }

  return {
    actorId: `token:${token.slice(0, 6)}`,
  };
}
