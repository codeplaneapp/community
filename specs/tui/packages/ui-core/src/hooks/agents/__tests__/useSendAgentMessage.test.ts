import { describe, it, expect, beforeEach, mock } from "bun:test";
import { useSendAgentMessage } from "../useSendAgentMessage.js";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { ApiError, NetworkError } from "../../../types/errors.js";

describe("useSendAgentMessage", () => {
  let mockClient: ReturnType<typeof createMockAPIClient>;

  beforeEach(() => {
    mockClient = createMockAPIClient();
  });

  describe("client-side validation", () => {
    it("rejects invalid role with ApiError 400 'invalid role'", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      expect(() => result.current.send({ role: "admin" as any, parts: [] })).toThrow("invalid role");
      unmount();
    });

    it("rejects empty parts array with ApiError 400 'parts are required'", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      expect(() => result.current.send({ role: "user", parts: [] })).toThrow("parts are required");
      unmount();
    });

    it("rejects undefined parts with ApiError 400 'parts are required'", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      expect(() => result.current.send({ role: "user", parts: undefined as any })).toThrow("parts are required");
      unmount();
    });

    it("rejects non-array parts with ApiError 400 'parts are required'", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      expect(() => result.current.send({ role: "user", parts: "not array" as any })).toThrow("parts are required");
      unmount();
    });

    it("rejects invalid part type with ApiError 400 'invalid part type'", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      expect(() => result.current.send({ role: "user", parts: [{ type: "unknown" as any, content: "hi" }] })).toThrow("invalid part type");
      unmount();
    });

    it("rejects null part content with ApiError 400 'part content is required'", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      expect(() => result.current.send({ role: "user", parts: [{ type: "text", content: null }] })).toThrow("part content is required");
      unmount();
    });

    it("rejects undefined part content with ApiError 400 'part content is required'", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      expect(() => result.current.send({ role: "user", parts: [{ type: "text", content: undefined }] })).toThrow("part content is required");
      unmount();
    });

    it("all validation errors are instanceof ApiError with code BAD_REQUEST", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      try {
        result.current.send({ role: "x" as any, parts: [] });
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.code).toBe("BAD_REQUEST");
      }
      unmount();
    });

    it("validates role before parts (order matches server)", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      expect(() => result.current.send({ role: "x" as any, parts: undefined as any })).toThrow("invalid role");
      unmount();
    });

    it("trims role before validation (matching server line 242)", async () => {
      mockClient.respondWithJSON(201, { id: "1" });
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      
      // Should not throw
      const p = result.current.send({ role: " user " as any, parts: [{ type: "text", content: "hi" }] });
      await p;
      unmount();
    });

    it("no network request made on validation failure", () => {
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      try {
        result.current.send({ role: "user", parts: [] });
      } catch {}
      expect(mockClient.calls.length).toBe(0);
      unmount();
    });
  });

  describe("optimistic message", () => {
    it("calls onOptimistic before network request", async () => {
      mockClient.respondWithJSON(201, { id: "1" });
      const cbs = { onOptimistic: mock() };
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1", cbs), { apiClient: mockClient });
      
      const p = result.current.send({ role: "user", parts: [{ type: "text", content: "hi" }] });
      expect(cbs.onOptimistic).toHaveBeenCalled();
      
      const tempMsg = cbs.onOptimistic.mock.calls[0][0];
      expect(tempMsg.id.startsWith("tmp_")).toBe(true);
      expect(tempMsg.sequence).toBe(-1);
      expect(tempMsg.role).toBe("user");
      expect(tempMsg.sessionId).toBe("1");
      expect(typeof tempMsg.createdAt).toBe("string");
      
      await p;
      unmount();
    });

    it("consecutive calls produce unique temp ids", async () => {
      mockClient.respondWithJSON(201, { id: "1" });
      mockClient.respondWithJSON(201, { id: "2" });
      const cbs = { onOptimistic: mock() };
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1", cbs), { apiClient: mockClient });
      
      // we must await to avoid double submit
      await result.current.send({ role: "user", parts: [{ type: "text", content: "1" }] });
      await result.current.send({ role: "user", parts: [{ type: "text", content: "2" }] });
      
      const id1 = cbs.onOptimistic.mock.calls[0][0].id;
      const id2 = cbs.onOptimistic.mock.calls[1][0].id;
      expect(id1).not.toBe(id2);
      unmount();
    });
  });

  describe("mutation lifecycle", () => {
    it("sends POST to /api/repos/:owner/:repo/agent/sessions/:id/messages", async () => {
      mockClient.respondWithJSON(201, { id: "msg_1", sequence: "5" });
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      
      const p = result.current.send({ role: "user", parts: [{ type: "text", content: "hi" }] });
      expect(result.current.sending).toBe(true);
      
      const res = await p;
      expect(mockClient.calls[0].path).toBe("/api/repos/o/r/agent/sessions/1/messages");
      
      const reqBody = JSON.parse(mockClient.calls[0].options!.body as string);
      expect(reqBody.role).toBe("user");
      
      expect(res.id).toBe("msg_1");
      expect(res.sequence).toBe(5); // coerced to number
      
      unmount();
    });
  });

  describe("settled callback", () => {
    it("calls onSettled with tempId and serverMessage on success", async () => {
      const serverMsg = { id: "msg_1", sequence: "1" };
      mockClient.respondWithJSON(201, serverMsg);
      const cbs = { onSettled: mock(), onOptimistic: mock() };
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1", cbs), { apiClient: mockClient });
      
      await result.current.send({ role: "user", parts: [{ type: "text", content: "hi" }] });
      const tempId = cbs.onOptimistic.mock.calls[0][0].id;
      
      expect(cbs.onSettled).toHaveBeenCalledWith(tempId, { ...serverMsg, sequence: 1 });
      unmount();
    });

    it("calls onSettled with tempId and null on error", async () => {
      mockClient.respondWithError(new Error("fail"));
      const cbs = { onSettled: mock(), onOptimistic: mock() };
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1", cbs), { apiClient: mockClient });
      
      try {
        await result.current.send({ role: "user", parts: [{ type: "text", content: "hi" }] });
      } catch {}
      
      const tempId = cbs.onOptimistic.mock.calls[0][0].id;
      expect(cbs.onSettled).toHaveBeenCalledWith(tempId, null);
      unmount();
    });
  });

  describe("error callbacks", () => {
    it("calls onRevert and onError with tempId on error", async () => {
      mockClient.respondWithError(new Error("fail"));
      const cbs = { onRevert: mock(), onError: mock(), onOptimistic: mock() };
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1", cbs), { apiClient: mockClient });
      
      try {
        await result.current.send({ role: "user", parts: [{ type: "text", content: "hi" }] });
      } catch {}
      
      const tempId = cbs.onOptimistic.mock.calls[0][0].id;
      expect(cbs.onRevert).toHaveBeenCalledWith(tempId);
      expect(cbs.onError).toHaveBeenCalled();
      expect(cbs.onError.mock.calls[0][1]).toBe(tempId);
      unmount();
    });
  });

  describe("double-submit prevention", () => {
    it("rejects second send while first is in-flight", async () => {
      mockClient.respondWithJSON(201, { id: "1" });
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      
      const p1 = result.current.send({ role: "user", parts: [{ type: "text", content: "1" }] });
      
      try {
        await result.current.send({ role: "user", parts: [{ type: "text", content: "2" }] });
        expect(false).toBe(true);
      } catch (e: any) {
        expect(e.message).toBe("mutation in progress");
      }
      
      await p1;
      unmount();
    });
  });

  describe("error handling", () => {
    it("maps 401 response to UNAUTHORIZED ApiError", async () => {
      mockClient.respondWithJSON(401, {});
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      
      try {
        await result.current.send({ role: "user", parts: [{ type: "text", content: "1" }] });
      } catch (e: any) {
        expect(e.code).toBe("UNAUTHORIZED");
      }
      unmount();
    });

    it("maps 400 response to BAD_REQUEST ApiError (server validation)", async () => {
      mockClient.respondWithJSON(400, {});
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      
      try {
        await result.current.send({ role: "user", parts: [{ type: "text", content: "1" }] });
      } catch (e: any) {
        expect(e.code).toBe("BAD_REQUEST");
      }
      unmount();
    });

    it("handles NetworkError", async () => {
      mockClient.respondWithError(new Error("network"));
      const { result, unmount } = renderHook(() => useSendAgentMessage("o", "r", "1"), { apiClient: mockClient });
      
      try {
        await result.current.send({ role: "user", parts: [{ type: "text", content: "1" }] });
      } catch (e: any) {
        expect(e).toBeInstanceOf(NetworkError);
      }
      unmount();
    });
  });
});