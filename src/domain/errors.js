export class BrokerError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = "BrokerError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function isBrokerError(error) {
  return error instanceof BrokerError;
}
