import { describe, it, expect } from "bun:test";

describe("useDestroyWorkspaceSession", () => {
  describe("mutation lifecycle", () => {
    it("sends POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy", () => {});
    it("uses POST method not DELETE", () => {});
    it("resolves on 204 empty body", () => {});
    it("calls onOptimistic before network request", () => {});
  });
  describe("deduplication", () => {
    it("returns same promise for concurrent destroys of same id", () => {});
    it("allows new destroy after previous completes", () => {});
  });
  describe("error handling", () => {
    it("calls onRevert on error", () => {});
    it("calls onError with error and sessionId", () => {});
  });
  describe("empty sessionId guard", () => {
    it("throws ApiError(400) for empty sessionId", () => {});
  });
  describe("cleanup", () => {
    it("aborts on unmount", () => {});
  });
  describe("integration — real server", () => {
    it("destroys session on running server", () => {});
  });
});
