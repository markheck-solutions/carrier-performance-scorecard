export type RetryDecision = {
  attempt: number;
  delayMs: number;
  error: unknown;
};

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  delay?: (delayMs: number) => Promise<void>;
  onRetry?: (decision: RetryDecision) => void;
};

export type CircuitBreakerState = "closed" | "open" | "half-open";

export type CircuitBreakerOptions = {
  failureThreshold?: number;
  resetAfterMs?: number;
  now?: () => number;
};

export class RetryExhaustedError extends Error {
  readonly attempts: number;

  constructor(attempts: number, options: { cause: unknown }) {
    super(`Operation failed after ${attempts} attempt(s).`, { cause: options.cause });
    this.name = "RetryExhaustedError";
    this.attempts = attempts;
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super("Circuit breaker is open.");
    this.name = "CircuitBreakerOpenError";
  }
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetAfterMs: number;
  private readonly now: () => number;
  private failures = 0;
  private openedAt: number | null = null;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, Math.floor(options.failureThreshold ?? 3));
    this.resetAfterMs = Math.max(1, Math.floor(options.resetAfterMs ?? 30_000));
    this.now = options.now ?? Date.now;
  }

  get state(): CircuitBreakerState {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.resetAfterMs ? "half-open" : "open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openedAt = this.now();
    }
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      throw new CircuitBreakerOpenError();
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}

function defaultDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function computeBackoffDelay(
  attempt: number,
  options: Pick<RetryOptions, "baseDelayMs" | "maxDelayMs" | "jitterRatio"> = {},
): number {
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 2_000;
  const jitterRatio = Math.max(0, Math.min(options.jitterRatio ?? 0, 0.5));
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = exponential * jitterRatio;
  return Math.round(exponential + jitter);
}

export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const delay = options.delay ?? defaultDelay;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const hasMoreAttempts = attempt < attempts;
      const retryAllowed = options.shouldRetry ? options.shouldRetry(error, attempt) : true;
      if (!hasMoreAttempts || !retryAllowed) break;

      const delayMs = computeBackoffDelay(attempt, options);
      options.onRetry?.({ attempt, delayMs, error });
      await delay(delayMs);
    }
  }

  throw new RetryExhaustedError(attempts, { cause: lastError });
}
