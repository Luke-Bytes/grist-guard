import { createHash } from "node:crypto";

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = stableSortValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

export function createDeterministicIdempotencyKey(input: {
  sessionId?: string;
  toolName: string;
  target: Record<string, unknown>;
  payload: Record<string, unknown>;
}): string {
  const normalized = stableSortValue({
    sessionId: input.sessionId ?? "unknown-session",
    toolName: input.toolName,
    target: input.target,
    payload: input.payload,
  });
  const hash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return `gg-${hash}`;
}
