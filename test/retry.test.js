import test from "node:test";
import assert from "node:assert/strict";

import { withRetry } from "../src/application/retry.js";

test("withRetry retries retryable failures and returns success", async () => {
  let attempts = 0;

  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("transient");
        error.retryable = true;
        throw error;
      }

      return "ok";
    },
    {
      attempts: 3,
      baseDelayMs: 1,
      shouldRetry(error) {
        return error.retryable === true;
      },
    },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});
