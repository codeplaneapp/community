import { describe, test, expect } from "bun:test";
import { SSE_CONSTANTS } from "../../../apps/tui/src/streaming/types";

describe("SSE_CONSTANTS", () => {
  test("initial backoff is 1 second", () => {
    expect(SSE_CONSTANTS.INITIAL_BACKOFF_MS).toBe(1_000);
  });

  test("max backoff is 30 seconds", () => {
    expect(SSE_CONSTANTS.MAX_BACKOFF_MS).toBe(30_000);
  });

  test("backoff multiplier is 2 (exponential)", () => {
    expect(SSE_CONSTANTS.BACKOFF_MULTIPLIER).toBe(2);
  });

  test("keepalive timeout is 45 seconds (3× server keep-alive)", () => {
    expect(SSE_CONSTANTS.KEEPALIVE_TIMEOUT_MS).toBe(45_000);
    expect(SSE_CONSTANTS.KEEPALIVE_TIMEOUT_MS as number).toBe(
      (SSE_CONSTANTS.SERVER_KEEPALIVE_MS as number) * 3,
    );
  });

  test("dedup window size is 1000", () => {
    expect(SSE_CONSTANTS.DEDUP_WINDOW_SIZE).toBe(1_000);
  });

  test("backoff sequence matches spec: 1s → 2s → 4s → 8s → ... → 30s", () => {
    let delay: number = SSE_CONSTANTS.INITIAL_BACKOFF_MS;
    const sequence: number[] = [delay];

    for (let i = 0; i < 10; i++) {
      delay = Math.min(delay * SSE_CONSTANTS.BACKOFF_MULTIPLIER, SSE_CONSTANTS.MAX_BACKOFF_MS);
      sequence.push(delay);
    }

    expect(sequence).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000]);
  });
});
