import { describe, it, expect } from "bun:test";

describe("useDeleteWorkspaceSnapshot", () => {
  describe("mutation lifecycle", () => {
    it("sends DELETE /api/repos/:owner/:repo/workspace-snapshots/:id", () => {});
    it("resolves on 204 empty body", () => {});
    it("calls onOptimistic before network request", () => {});
  });
  describe("deduplication", () => {
    it("returns same promise for concurrent deletes of same id", () => {});
    it("allows new delete after previous completes", () => {});
  });
  describe("error handling", () => {
    it("calls onRevert on error", () => {});
    it("calls onError with error and snapshotId", () => {});
  });
  describe("empty snapshotId guard", () => {
    it("throws ApiError(400) for empty snapshotId", () => {});
  });
  describe("cleanup", () => {
    it("aborts on unmount", () => {});
  });
  describe("integration — real server", () => {
    it("deletes snapshot on running server", () => {});
  });
});
