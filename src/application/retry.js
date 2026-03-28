function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withRetry(task, options) {
  const attempts = Math.max(options.attempts ?? 1, 1);
  const baseDelayMs = Math.max(options.baseDelayMs ?? 100, 1);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (!options.shouldRetry(error) || attempt === attempts) {
        throw error;
      }

      if (options.onRetry) {
        options.onRetry(error, attempt);
      }

      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
