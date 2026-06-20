const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
      const maxWait = Math.min(30000, 1000 * Math.pow(2, attempt));
      const waitTime = Math.random() * maxWait;
      console.warn(`Attempt ${attempt} failed. Retrying in ${Math.round(waitTime)}ms... Error:`, error);
      await sleep(waitTime);
    }
  }
  throw lastError;
}
