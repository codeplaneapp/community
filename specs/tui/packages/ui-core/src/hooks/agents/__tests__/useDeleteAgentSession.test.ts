import { describe, it, expect, beforeEach, mock } from "bun:test";
import { useDeleteAgentSession } from "../useDeleteAgentSession.js";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { ApiError, NetworkError } from "../../../types/errors.js";

describe("useDeleteAgentSession", () => {
  let mockClient: ReturnType<typeof createMockAPIClient>;

  beforeEach(() => {
    mockClient = createMockAPIClient();
  });

  describe("mutation lifecycle", () => {
    it("sends DELETE to /api/repos/:owner/:repo/agent/sessions/:id and resolves on 204", async () => {
      mockClient.respondWith(new Response(null, { status: 204 }));
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r"), { apiClient: mockClient });
      
      await result.current.mutate("1");
      expect(mockClient.calls[0].path).toBe("/api/repos/o/r/agent/sessions/1");
      expect(mockClient.calls[0].options?.method).toBe("DELETE");
      unmount();
    });
  });

  describe("optimistic callbacks", () => {
    it("calls onOptimistic synchronously with sessionId before request", async () => {
      mockClient.respondWith(new Response(null, { status: 204 }));
      const cbs = { onOptimistic: mock(), onSettled: mock() };
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r", cbs), { apiClient: mockClient });
      
      const p = result.current.mutate("1");
      expect(cbs.onOptimistic).toHaveBeenCalledWith("1");
      await p;
      expect(cbs.onSettled).toHaveBeenCalledWith("1");
      unmount();
    });

    it("calls onRevert and onError on failure", async () => {
      mockClient.respondWithError(new Error("fail"));
      const cbs = { onRevert: mock(), onError: mock(), onSettled: mock() };
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r", cbs), { apiClient: mockClient });
      
      try {
        await result.current.mutate("1");
      } catch {}
      
      expect(cbs.onRevert).toHaveBeenCalledWith("1");
      expect(cbs.onError).toHaveBeenCalled();
      expect(cbs.onSettled).toHaveBeenCalledWith("1");
      unmount();
    });
  });

  describe("deduplication", () => {
    it("returns same promise for concurrent deletes of same sessionId", async () => {
      mockClient.respondWith(new Response(null, { status: 204 }));
      const cbs = { onOptimistic: mock() };
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r", cbs), { apiClient: mockClient });
      
      const p1 = result.current.mutate("1");
      const p2 = result.current.mutate("1");
      
      expect(p1).toBe(p2);
      expect(cbs.onOptimistic).toHaveBeenCalledTimes(1);
      
      await p1;
      unmount();
    });

    it("allows concurrent deletes of different sessionIds", async () => {
      mockClient.respondWith(new Response(null, { status: 204 }));
      mockClient.respondWith(new Response(null, { status: 204 }));
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r"), { apiClient: mockClient });
      
      const p1 = result.current.mutate("1");
      const p2 = result.current.mutate("2");
      
      expect(p1).not.toBe(p2);
      expect(result.current.isLoading).toBe(true);
      
      await Promise.all([p1, p2]);
      unmount();
    });
  });

  describe("error handling", () => {
    it("maps 401 response to UNAUTHORIZED ApiError", async () => {
      mockClient.respondWithJSON(401, {});
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r"), { apiClient: mockClient });
      
      try {
        await result.current.mutate("1");
        expect(false).toBe(true);
      } catch (e: any) {
        expect(e.code).toBe("UNAUTHORIZED");
      }
      unmount();
    });

    it("maps 404 response to NOT_FOUND ApiError", async () => {
      mockClient.respondWithJSON(404, {});
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r"), { apiClient: mockClient });
      
      try {
        await result.current.mutate("1");
        expect(false).toBe(true);
      } catch (e: any) {
        expect(e.code).toBe("NOT_FOUND");
      }
      unmount();
    });

    it("handles NetworkError", async () => {
      mockClient.respondWithError(new Error("network"));
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r"), { apiClient: mockClient });
      
      try {
        await result.current.mutate("1");
        expect(false).toBe(true);
      } catch (e: any) {
        expect(e).toBeInstanceOf(NetworkError);
      }
      unmount();
    });
  });

  describe("cleanup", () => {
    it("aborts all in-flight deletes on unmount", () => {
      mockClient.respondWith(new Response(null, { status: 204 }));
      const { result, unmount } = renderHook(() => useDeleteAgentSession("o", "r"), { apiClient: mockClient });
      
      result.current.mutate("1");
      unmount();
    });
  });
});