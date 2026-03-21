import { describe, it, expect } from "bun:test";

describe("useDeleteWorkspace", () => {
  describe("mutation lifecycle", () => {
    it("sends DELETE /api/repos/:owner/:repo/workspaces/:id", () => {});
    it("resolves on 204 empty body", () => {});
    it("calls onOptimistic before network request", () => {});
    it("calls onSettled after success", () => {});
    it("clears error after successful delete", () => {});
  });
  describe("deduplication", () => {
    it("returns same promise for concurrent deletes of same id", () => {});
    it("does not call onOptimistic on deduplicated call", () => {});
    it("allows new delete after previous completes", () => {});
    it("tracks separate promises for different workspace ids", () => {});
  });
  describe("error handling", () => {
    it("calls onRevert on error", () => {});
    it("calls onError with error and workspaceId", () => {});
    it("calls onSettled after error", () => {});
    it("sets error state", () => {});
    it("re-throws error", () => {});
    it("removes from dedup map on error", () => {});
  });
  describe("isLoading", () => {
    it("isLoading true when any delete in-flight", () => {});
    it("isLoading false when all deletes complete", () => {});
  });
  describe("empty workspaceId guard", () => {
    it("throws ApiError(400) for empty workspaceId", () => {});
  });
  describe("cleanup", () => {
    it("aborts all in-flight deletes on unmount", () => {});
    it("does not update state after unmount", () => {});
  });
  describe("integration — real server", () => {
    it("deletes workspace on running server", () => {});
  });
});
