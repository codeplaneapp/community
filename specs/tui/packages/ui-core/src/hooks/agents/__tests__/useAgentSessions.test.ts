import { describe, it, expect, beforeEach } from "bun:test";
import { useAgentSessions } from "../useAgentSessions.js";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { ApiError, NetworkError } from "../../../types/errors.js";

describe("useAgentSessions", () => {
  let mockClient: ReturnType<typeof createMockAPIClient>;

  beforeEach(() => {
    mockClient = createMockAPIClient();
  });

  describe("initial state", () => {
    it("returns empty sessions array before fetch completes", () => {
      mockClient.respondWithJSON(200, []);
      const { result, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      expect(result.current.sessions).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      unmount();
    });

    it("isLoading is false on mount when enabled=false", () => {
      const { result, unmount } = renderHook(() => useAgentSessions("o", "r", { enabled: false }), { apiClient: mockClient });
      expect(result.current.isLoading).toBe(false);
      unmount();
    });
  });

  describe("fetch lifecycle", () => {
    it("fetches /api/repos/:owner/:repo/agent/sessions with page=1&per_page=30", async () => {
      mockClient.respondWithJSON(200, [{ id: "1", messageCount: "5" }], { "X-Total-Count": "10" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      expect(mockClient.calls[0].path).toBe("/api/repos/o/r/agent/sessions?page=1&per_page=30");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.sessions[0].id).toBe("1");
      expect(result.current.sessions[0].messageCount).toBe(5);
      expect(result.current.totalCount).toBe(10);
      unmount();
    });

    it("respects custom perPage option and caps at 50", async () => {
      mockClient.respondWithJSON(200, []);
      const { waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r", { perPage: 100 }), { apiClient: mockClient });
      await waitForNextUpdate();
      
      expect(mockClient.calls[0].path).toBe("/api/repos/o/r/agent/sessions?page=1&per_page=50");
      unmount();
    });
  });

  describe("hasMore", () => {
    it("hasMore=true when sessions.length < totalCount", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "2" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect(result.current.hasMore).toBe(true);
      unmount();
    });

    it("hasMore=false when sessions.length >= totalCount", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "1" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect(result.current.hasMore).toBe(false);
      unmount();
    });

    it("hasMore=false when X-Total-Count header absent", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }]);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect(result.current.hasMore).toBe(false);
      unmount();
    });
  });

  describe("fetchMore", () => {
    it("fetches page=2 and appends to existing sessions", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "2" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, [{ id: "2" }], { "X-Total-Count": "2" });
      result.current.fetchMore();
      await waitForNextUpdate();
      
      expect(result.current.sessions.map(s => s.id)).toEqual(["1", "2"]);
      expect(mockClient.calls[1].path).toBe("/api/repos/o/r/agent/sessions?page=2&per_page=30");
      unmount();
    });

    it("no-op when hasMore=false", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "1" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      result.current.fetchMore();
      expect(mockClient.calls.length).toBe(1);
      unmount();
    });

    it("no-op when isLoading=true", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "2" });
      const { result, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      result.current.fetchMore(); // still loading first page
      expect(mockClient.calls.length).toBe(1);
      unmount();
    });
  });

  describe("refetch", () => {
    it("resets page to 1 and re-fetches, preserving items", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "1" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, [{ id: "2" }], { "X-Total-Count": "1" });
      result.current.refetch();
      expect(result.current.sessions[0].id).toBe("1"); // stale while revalidate
      await waitForNextUpdate();
      
      expect(result.current.sessions[0].id).toBe("2");
      expect(mockClient.calls[1].path).toBe("/api/repos/o/r/agent/sessions?page=1&per_page=30");
      unmount();
    });
  });

  describe("param changes", () => {
    it("re-fetches and clears items on param change (hard reset)", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "1" });
      let repo = "r";
      const { result, waitForNextUpdate, rerender, unmount } = renderHook(() => useAgentSessions("o", repo), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, [{ id: "2" }], { "X-Total-Count": "1" });
      repo = "r2";
      rerender();
      
      expect(result.current.sessions).toEqual([]); // items cleared
      await waitForNextUpdate();
      expect(result.current.sessions[0].id).toBe("2");
      unmount();
    });
    
    it("aborts in-flight request on param change", () => {
      mockClient.respondWithJSON(200, [{ id: "1" }]);
      let repo = "r";
      const { rerender, unmount } = renderHook(() => useAgentSessions("o", repo), { apiClient: mockClient });
      
      repo = "r2";
      rerender();
      expect(mockClient.calls.length).toBe(2);
      unmount();
    });
  });

  describe("enabled option", () => {
    it("fetches when enabled transitions from false to true", async () => {
      let enabled = false;
      const { result, waitForNextUpdate, rerender, unmount } = renderHook(() => useAgentSessions("o", "r", { enabled }), { apiClient: mockClient });
      expect(mockClient.calls.length).toBe(0);
      
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "1" });
      enabled = true;
      rerender();
      
      await waitForNextUpdate();
      expect(mockClient.calls.length).toBe(1);
      expect(result.current.sessions[0].id).toBe("1");
      unmount();
    });

    it("aborts in-flight and clears items when enabled transitions true to false", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "1" });
      let enabled = true;
      const { result, waitForNextUpdate, rerender, unmount } = renderHook(() => useAgentSessions("o", "r", { enabled }), { apiClient: mockClient });
      await waitForNextUpdate();
      
      enabled = false;
      rerender();
      expect(result.current.sessions).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      unmount();
    });
  });

  describe("abort and cleanup", () => {
    it("aborts request on unmount", () => {
      mockClient.respondWithJSON(200, []);
      const { unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      unmount();
    });
  });

  describe("memory cap", () => {
    it("evicts oldest items when exceeding 500", async () => {
      const generateItems = (count: number, offset: number) => Array.from({ length: count }).map((_, i) => ({ id: `id-${i + offset}` }));
      
      mockClient.respondWithJSON(200, generateItems(300, 0), { "X-Total-Count": "1000" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r", { perPage: 50 }), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, generateItems(300, 300), { "X-Total-Count": "1000" });
      result.current.fetchMore();
      await waitForNextUpdate();
      
      expect(result.current.sessions.length).toBe(500); // capped
      expect(result.current.sessions[0].id).toBe("id-100"); // 0-99 evicted
      unmount();
    });
  });

  describe("error handling", () => {
    it("maps 401 response to UNAUTHORIZED ApiError", async () => {
      mockClient.respondWithJSON(401, { message: "unauth" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect((result.current.error as ApiError).code).toBe("UNAUTHORIZED");
      unmount();
    });

    it("sets NetworkError on fetch failure", async () => {
      mockClient.respondWithError(new Error("fail"));
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect((result.current.error as NetworkError).code).toBe("NETWORK_ERROR");
      unmount();
    });
    
    it("preserves stale sessions on error and clears error on successful refetch", async () => {
      mockClient.respondWithJSON(200, [{ id: "1" }], { "X-Total-Count": "1" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentSessions("o", "r"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithError(new Error("fail"));
      result.current.refetch();
      await waitForNextUpdate();
      
      expect(result.current.sessions[0].id).toBe("1");
      expect(result.current.error).not.toBeNull();
      
      mockClient.respondWithJSON(200, [{ id: "2" }], { "X-Total-Count": "1" });
      result.current.refetch();
      await waitForNextUpdate();
      
      expect(result.current.error).toBeNull();
      expect(result.current.sessions[0].id).toBe("2");
      unmount();
    });
  });
});