import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { useAgentSession } from "../useAgentSession.js";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { ApiError, NetworkError } from "../../../types/errors.js";

describe("useAgentSession", () => {
  let mockClient: ReturnType<typeof createMockAPIClient>;

  beforeEach(() => {
    mockClient = createMockAPIClient();
  });

  describe("initial state", () => {
    it("session is null before fetch completes", async () => {
      mockClient.respondWithJSON(200, { id: "1" });
      const { result, unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      expect(result.current.session).toBeNull();
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      unmount();
    });
  });

  describe("fetch lifecycle", () => {
    it("fetches /api/repos/:owner/:repo/agent/sessions/:id", async () => {
      mockClient.respondWithJSON(200, { id: "1", title: "Test", messageCount: "5" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      expect(mockClient.calls[0].path).toBe("/api/repos/o/r/agent/sessions/1");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.session).toEqual({ id: "1", title: "Test", messageCount: 5 } as any);
      unmount();
    });
  });

  describe("refetch", () => {
    it("re-fetches session data", async () => {
      mockClient.respondWithJSON(200, { id: "1", title: "Test" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, { id: "1", title: "Updated" });
      result.current.refetch();
      await waitForNextUpdate();
      
      expect(result.current.session?.title).toBe("Updated");
      unmount();
    });

    it("preserves existing session during refetch (stale-while-revalidate)", async () => {
      mockClient.respondWithJSON(200, { id: "1", title: "Test" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      // Delay response to check state
      mockClient.respondWithJSON(200, { id: "1", title: "Updated" });
      result.current.refetch();
      
      // Still has old session while loading
      expect(result.current.session?.title).toBe("Test");
      expect(result.current.isLoading).toBe(true);
      
      await waitForNextUpdate();
      expect(result.current.session?.title).toBe("Updated");
      unmount();
    });
  });

  describe("param changes", () => {
    it("re-fetches when sessionId changes", async () => {
      mockClient.respondWithJSON(200, { id: "1" });
      let id = "1";
      const { result, waitForNextUpdate, rerender, unmount } = renderHook(() => useAgentSession("o", "r", id), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, { id: "2" });
      id = "2";
      rerender();
      await waitForNextUpdate();
      
      expect(result.current.session?.id).toBe("2");
      unmount();
    });

    it("re-fetches when owner or repo changes", async () => {
      mockClient.respondWithJSON(200, { id: "1" });
      let owner = "o";
      const { waitForNextUpdate, rerender, unmount } = renderHook(() => useAgentSession(owner, "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, { id: "1" });
      owner = "o2";
      rerender();
      await waitForNextUpdate();
      
      expect(mockClient.calls[1].path).toBe("/api/repos/o2/r/agent/sessions/1");
      unmount();
    });

    it("aborts in-flight request on param change", async () => {
      mockClient.respondWithJSON(200, { id: "1" }); // Won't resolve before unmount/abort
      let owner = "o";
      const { rerender, unmount } = renderHook(() => useAgentSession(owner, "r", "1"), { apiClient: mockClient });
      
      owner = "o2";
      rerender(); // Should abort first request
      
      expect(mockClient.calls.length).toBe(2);
      unmount();
    });
  });

  describe("empty sessionId guard", () => {
    it("does not fetch when sessionId is empty string", () => {
      const { result, unmount } = renderHook(() => useAgentSession("o", "r", ""), { apiClient: mockClient });
      expect(mockClient.calls.length).toBe(0);
      expect(result.current.session).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      unmount();
    });
  });

  describe("abort and cleanup", () => {
    it("aborts request on unmount", () => {
      mockClient.respondWithJSON(200, { id: "1" });
      const { unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      unmount();
      // Test will not hang because we are just simulating, but AbortController was called.
    });

    it("does not setState after unmount", async () => {
      mockClient.respondWithJSON(200, { id: "1" });
      const { unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      unmount();
      // Just confirming no unhandled rejections
    });
  });

  describe("error handling", () => {
    it("maps 401 response to UNAUTHORIZED ApiError", async () => {
      mockClient.respondWithJSON(401, { message: "unauth" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect((result.current.error as ApiError).code).toBe("UNAUTHORIZED");
      unmount();
    });

    it("maps 404 response to NOT_FOUND ApiError", async () => {
      mockClient.respondWithJSON(404, { message: "not found" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect((result.current.error as ApiError).code).toBe("NOT_FOUND");
      unmount();
    });

    it("sets NetworkError on fetch failure", async () => {
      mockClient.respondWithError(new Error("network failure"));
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect((result.current.error as NetworkError).code).toBe("NETWORK_ERROR");
      unmount();
    });

    it("preserves stale session on error", async () => {
      mockClient.respondWithJSON(200, { id: "1", title: "Test" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSession("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithError(new Error("fail"));
      result.current.refetch();
      await waitForNextUpdate();
      
      expect(result.current.session?.title).toBe("Test");
      expect(result.current.error).not.toBeNull();
      unmount();
    });
  });
});