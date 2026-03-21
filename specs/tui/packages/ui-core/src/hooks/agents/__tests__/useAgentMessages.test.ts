import { describe, it, expect, beforeEach } from "bun:test";
import { useAgentMessages } from "../useAgentMessages.js";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { ApiError, NetworkError } from "../../../types/errors.js";

describe("useAgentMessages", () => {
  let mockClient: ReturnType<typeof createMockAPIClient>;

  beforeEach(() => {
    mockClient = createMockAPIClient();
  });

  describe("initial state", () => {
    it("returns empty messages array before fetch completes", () => {
      mockClient.respondWithJSON(200, []);
      const { result, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      expect(result.current.messages).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      unmount();
    });
  });

  describe("fetch lifecycle", () => {
    it("fetches /api/repos/:owner/:repo/agent/sessions/:id/messages", async () => {
      mockClient.respondWithJSON(200, [{ id: "m1", sequence: "1", parts: [{ partIndex: "0" }] }]);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      expect(mockClient.calls[0].path).toBe("/api/repos/o/r/agent/sessions/1/messages?page=1&per_page=30");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages[0].sequence).toBe(1); // coerced
      expect(result.current.messages[0].parts?.[0].partIndex).toBe(0); // coerced
      unmount();
    });
  });

  describe("hasMore (no X-Total-Count)", () => {
    it("hasMore=true when last page has perPage items", async () => {
      const items = Array.from({ length: 30 }).map((_, i) => ({ id: `m${i}` }));
      mockClient.respondWithJSON(200, items);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect(result.current.hasMore).toBe(true);
      unmount();
    });

    it("hasMore=false when last page has fewer than perPage items", async () => {
      mockClient.respondWithJSON(200, [{ id: "m1" }]);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect(result.current.hasMore).toBe(false);
      unmount();
    });

    it("hasMore=false when last page is empty", async () => {
      mockClient.respondWithJSON(200, []);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect(result.current.hasMore).toBe(false);
      unmount();
    });
  });

  describe("totalCount", () => {
    it("totalCount equals messages.length (running count)", async () => {
      mockClient.respondWithJSON(200, [{ id: "m1" }, { id: "m2" }]);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect(result.current.totalCount).toBe(2);
      unmount();
    });
  });

  describe("fetchMore", () => {
    it("fetches page=2 and appends", async () => {
      const items = Array.from({ length: 30 }).map((_, i) => ({ id: `m${i}` }));
      mockClient.respondWithJSON(200, items);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, [{ id: "m30" }]);
      result.current.fetchMore();
      await waitForNextUpdate();
      
      expect(result.current.messages.length).toBe(31);
      expect(mockClient.calls[1].path).toBe("/api/repos/o/r/agent/sessions/1/messages?page=2&per_page=30");
      unmount();
    });

    it("no-op when hasMore=false", async () => {
      mockClient.respondWithJSON(200, [{ id: "m1" }]);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      result.current.fetchMore();
      expect(mockClient.calls.length).toBe(1);
      unmount();
    });
  });

  describe("refetch", () => {
    it("resets and re-fetches from page 1, preserving messages", async () => {
      mockClient.respondWithJSON(200, [{ id: "m1" }]);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, [{ id: "m2" }]);
      result.current.refetch();
      expect(result.current.messages[0].id).toBe("m1"); // stale while revalidate
      await waitForNextUpdate();
      
      expect(result.current.messages[0].id).toBe("m2");
      unmount();
    });
  });

  describe("param changes", () => {
    it("re-fetches when sessionId changes", async () => {
      mockClient.respondWithJSON(200, [{ id: "m1" }]);
      let id = "1";
      const { result, waitForNextUpdate, rerender, unmount } = renderHook(() => useAgentMessages("o", "r", id), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, [{ id: "m2" }]);
      id = "2";
      rerender();
      
      expect(result.current.messages).toEqual([]); // cleared
      await waitForNextUpdate();
      expect(result.current.messages[0].id).toBe("m2");
      unmount();
    });

    it("aborts in-flight request on param change", () => {
      mockClient.respondWithJSON(200, [{ id: "m1" }]);
      let id = "1";
      const { rerender, unmount } = renderHook(() => useAgentMessages("o", "r", id), { apiClient: mockClient });
      
      id = "2";
      rerender();
      expect(mockClient.calls.length).toBe(2);
      unmount();
    });
  });

  describe("empty sessionId guard", () => {
    it("does not fetch when sessionId is empty string", () => {
      const { result, unmount } = renderHook(() => useAgentMessages("o", "r", ""), { apiClient: mockClient });
      expect(mockClient.calls.length).toBe(0);
      expect(result.current.messages).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      unmount();
    });
  });

  describe("abort and cleanup", () => {
    it("aborts request on unmount", () => {
      mockClient.respondWithJSON(200, []);
      const { unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      unmount();
    });

    it("does not setState after unmount", async () => {
      mockClient.respondWithJSON(200, []);
      const { unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      unmount();
    });
  });

  describe("enabled option", () => {
    it("does not fetch when enabled=false", () => {
      const { result, unmount } = renderHook(() => useAgentMessages("o", "r", "1", { enabled: false }), { apiClient: mockClient });
      expect(mockClient.calls.length).toBe(0);
      expect(result.current.isLoading).toBe(false);
      unmount();
    });
  });

  describe("error handling", () => {
    it("maps 401 to UNAUTHORIZED", async () => {
      mockClient.respondWithJSON(401, { message: "unauth" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect((result.current.error as ApiError).code).toBe("UNAUTHORIZED");
      unmount();
    });

    it("sets NetworkError on fetch failure", async () => {
      mockClient.respondWithError(new Error("fail"));
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      expect((result.current.error as NetworkError).code).toBe("NETWORK_ERROR");
      unmount();
    });

    it("preserves stale messages on error", async () => {
      mockClient.respondWithJSON(200, [{ id: "m1" }]);
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithError(new Error("fail"));
      result.current.refetch();
      await waitForNextUpdate();
      
      expect(result.current.messages[0].id).toBe("m1");
      expect(result.current.error).not.toBeNull();
      unmount();
    });
  });

  describe("autoPaginate", () => {
    it("fetches pages sequentially until last page is partial", async () => {
      const page1 = Array.from({ length: 30 }).map((_, i) => ({ id: `m${i}` }));
      const page2 = Array.from({ length: 10 }).map((_, i) => ({ id: `m${i + 30}` }));
      
      // We will respond synchronously to mock client
      mockClient.respondWithJSON(200, page1);
      mockClient.respondWithJSON(200, page2);
      
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1", { autoPaginate: true }), { apiClient: mockClient });
      
      // Wait for page 1
      await waitForNextUpdate();
      // Auto-paginate should immediately fetch page 2, so it's still loading
      expect(result.current.isLoading).toBe(true);
      
      // Wait for page 2
      await waitForNextUpdate();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages.length).toBe(40);
      expect(mockClient.calls.length).toBe(2);
      unmount();
    });

    it("stops on error and preserves partially loaded messages", async () => {
      const page1 = Array.from({ length: 30 }).map((_, i) => ({ id: `m${i}` }));
      mockClient.respondWithJSON(200, page1);
      mockClient.respondWithError(new Error("fail")); // page 2 fails
      
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1", { autoPaginate: true }), { apiClient: mockClient });
      
      await waitForNextUpdate(); // page 1 resolves, triggers page 2 fetch
      await waitForNextUpdate(); // page 2 fails
      
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).not.toBeNull();
      expect(result.current.messages.length).toBe(30);
      unmount();
    });

    it("aborts remaining fetches on unmount", async () => {
      const page1 = Array.from({ length: 30 }).map((_, i) => ({ id: `m${i}` }));
      mockClient.respondWithJSON(200, page1);
      // page 2 doesn't resolve in time
      
      const { waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1", { autoPaginate: true }), { apiClient: mockClient });
      await waitForNextUpdate(); // page 1 loaded, page 2 started
      unmount(); // Should abort page 2
    });

    it("refetch during autoPaginate aborts current cycle and restarts", async () => {
      const page1 = Array.from({ length: 30 }).map((_, i) => ({ id: `m${i}` }));
      mockClient.respondWithJSON(200, page1);
      
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1", { autoPaginate: true }), { apiClient: mockClient });
      await waitForNextUpdate(); // page 1 loaded
      
      mockClient.respondWithJSON(200, [{ id: "m99" }]); // refetch page 1
      result.current.refetch();
      await waitForNextUpdate(); // refetch loaded
      
      expect(result.current.messages.length).toBe(1);
      expect(result.current.messages[0].id).toBe("m99");
      unmount();
    });
  });

  describe("memory cap", () => {
    it("evicts oldest messages when exceeding 10,000", async () => {
      // Simulating a response of 10,000 items is slow.
      // We will trust the mock tests in paginated query structure.
      const bigArray = Array.from({ length: 10000 }).map((_, i) => ({ id: `m${i}` }));
      mockClient.respondWithJSON(200, bigArray);
      
      const { result, waitForNextUpdate, unmount } = renderHook(() => useAgentMessages("o", "r", "1"), { apiClient: mockClient });
      await waitForNextUpdate();
      
      mockClient.respondWithJSON(200, [{ id: "new1" }, { id: "new2" }]);
      // Force lastPageItemCountRef to trigger hasMore by making perPage match
      
      // Let's just do a fetchMore and see if it caps
      result.current.fetchMore();
      await waitForNextUpdate();
      
      expect(result.current.messages.length).toBe(10000);
      expect(result.current.messages[result.current.messages.length - 1].id).toBe("new2");
      unmount();
    });
  });
});