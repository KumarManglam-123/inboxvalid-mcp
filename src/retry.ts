export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries = 3,
  baseDelay = 100
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      const jitter = Math.random() * baseDelay;
      const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
