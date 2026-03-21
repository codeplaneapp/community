import { describe, it, expect } from "bun:test";

describe("useSuspendWorkspace", () => {
  describe("mutation lifecycle", () => {
    it("sends POST /api/repos/:owner/:repo/workspaces/:id/suspend", () => {});
    it("returns updated workspace on 200", () => {});
    it("calls onOptimistic before network request", () => {});
    it("calls onSettled after success", () => {});
  });
  describe("error handling", () => {
    it("calls onRevert on error", () => {});
    it("calls onError with error and workspaceId", () => {});
    it("calls onSettled after error", () => {});
    it("sets error state", () => {});
  });
  describe("empty workspaceId guard", () => {
    it("throws ApiError(400) for empty workspaceId", () => {});
    it("does not make network request for empty workspaceId", () => {});
  });
  describe("double-submit prevention", () => {
    it("rejects concurrent suspend calls", () => {});
  });
  describe("cleanup", () => {
    it("aborts on unmount", () => {});
  });
  describe("integration — real server", () => {
    it("suspends workspace on running server", () => {});
  });
});
