import type { BrokerClient, BrokerExecution } from "./contracts.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollExecutionUntilSettled(
  client: BrokerClient,
  executionId: string,
  pollMs: number,
  timeoutMs: number,
): Promise<{ execution: BrokerExecution; timedOut: boolean }> {
  const startedAt = Date.now();
  let latest = (await client.getExecution(executionId)).execution;

  while (!latest.finishedAt && Date.now() - startedAt < timeoutMs) {
    await sleep(pollMs);
    latest = (await client.getExecution(executionId)).execution;
  }

  return {
    execution: latest,
    timedOut: !latest.finishedAt,
  };
}
