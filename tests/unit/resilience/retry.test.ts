import { describe, expect, it, vi } from "vitest";

import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  computeBackoffDelay,
  retryWithBackoff,
  RetryExhaustedError,
} from "@/lib/resilience/retry";

describe("retry with backoff", () => {
  it("retries failed operations with deterministic backoff", async () => {
    const delay = vi.fn(async () => undefined);
    const onRetry = vi.fn();
    let calls = 0;

    const result = await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("temporary dependency failure");
        return "ok";
      },
      { attempts: 3, baseDelayMs: 10, jitterRatio: 0, delay, onRetry },
    );

    expect(result).toBe("ok");
    expect(delay).toHaveBeenCalledWith(10);
    expect(delay).toHaveBeenCalledWith(20);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("stops when the retry policy rejects the error", async () => {
    await expect(
      retryWithBackoff(
        async () => {
          throw new Error("invalid request");
        },
        { attempts: 3, shouldRetry: () => false, delay: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(RetryExhaustedError);
  });

  it("caps computed delays", () => {
    expect(computeBackoffDelay(5, { baseDelayMs: 100, maxDelayMs: 250, jitterRatio: 0 })).toBe(250);
  });

  it("opens and recovers a circuit breaker around failing dependency calls", async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetAfterMs: 100, now: () => now });

    await expect(breaker.execute(async () => Promise.reject(new Error("dependency down")))).rejects.toThrow(
      "dependency down",
    );
    await expect(breaker.execute(async () => Promise.reject(new Error("dependency down")))).rejects.toThrow(
      "dependency down",
    );
    expect(breaker.state).toBe("open");
    await expect(breaker.execute(async () => "ok")).rejects.toBeInstanceOf(CircuitBreakerOpenError);

    now = 150;
    expect(breaker.state).toBe("half-open");
    await expect(breaker.execute(async () => "ok")).resolves.toBe("ok");
    expect(breaker.state).toBe("closed");
  });
});
