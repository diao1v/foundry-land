// Retry with exponential backoff: baseMs, 2×baseMs, 4×baseMs…
export async function withRetry<T>(fn: () => Promise<T>, tries = 3, baseMs = 500): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** (attempt - 1)));
    }
  }
}
