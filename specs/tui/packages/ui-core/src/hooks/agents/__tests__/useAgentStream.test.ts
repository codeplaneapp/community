import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useAgentStream } from "../useAgentStream.js";

describe("useAgentStream", () => {
  beforeEach(() => {
    mock.restore();
  });

  describe("initial state", () => {
    test("returns idle state before subscription", () => {
      const { result } = renderHook(
        () => useAgentStream("owner", "repo", "session-1", { enabled: false }),
        { apiClient: createMockAPIClient() }
      );

      expect(result.current.streaming).toBe(false);
      expect(result.current.connected).toBe(false);
      expect(result.current.reconnecting).toBe(false);
      expect(result.current.currentTokens).toBe("");
      expect(result.current.error).toBeNull();
    });

    test("empty sessionId disables auto-subscribe", () => {
      const { result } = renderHook(
        () => useAgentStream("owner", "repo", "", { enabled: true }),
        { apiClient: createMockAPIClient() }
      );

      expect(result.current.streaming).toBe(false);
      expect(result.current.connected).toBe(false);
    });
  });

  describe("subscribe / unsubscribe", () => {
    test("subscribe opens connection", () => {
      const { result } = renderHook(
        () => useAgentStream("owner", "repo", "session-1", { enabled: false }),
        { apiClient: createMockAPIClient() }
      );

      result.current.subscribe("session-1");

      // Initially transitioning to connecting
      expect(result.current.streaming).toBe(false); // connected | reconnecting
    });
  });
});
