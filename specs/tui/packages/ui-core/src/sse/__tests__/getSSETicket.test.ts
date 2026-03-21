import { describe, test, expect } from "bun:test";
import { getSSETicket } from "../getSSETicket.js";
import type { APIClient } from "../../client/types.js";
import { NetworkError } from "../../types/errors.js";

describe("getSSETicket", () => {
  test("returns ticket on successful exchange", async () => {
    const mockClient = {
      request: async () => ({
        ok: true,
        json: async () => ({
          ticket: "ticket-123",
          expiresAt: "2026-03-22T12:00:00Z",
        }),
      }),
    } as unknown as APIClient;

    const result = await getSSETicket(mockClient);
    expect(result).toEqual({
      ticket: "ticket-123",
      expiresAt: "2026-03-22T12:00:00Z",
    });
  });

  test("returns null on non-200 response", async () => {
    const mockClient = {
      request: async () => ({
        ok: false,
      }),
    } as unknown as APIClient;

    const result = await getSSETicket(mockClient);
    expect(result).toBeNull();
  });

  test("returns null on network error", async () => {
    const mockClient = {
      request: async () => {
        throw new NetworkError("Connection refused");
      },
    } as unknown as APIClient;

    const result = await getSSETicket(mockClient);
    expect(result).toBeNull();
  });

  test("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    
    const mockClient = {
      request: async (path: string, options?: any) => {
        if (options?.signal?.aborted) {
          throw new Error("AbortError");
        }
        return { ok: true, json: async () => ({}) };
      },
    } as unknown as APIClient;

    const result = await getSSETicket(mockClient, controller.signal);
    expect(result).toBeNull();
  });
});
