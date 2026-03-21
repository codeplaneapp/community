import { describe, it, expect } from "bun:test";

describe("useResumeWorkspace", () => {
  describe("mutation lifecycle", () => {
    it("sends POST /api/repos/:owner/:repo/workspaces/:id/resume", () => {});
    it("returns updated workspace on 200", () => {});
    it("calls onOptimistic before network request", () => {});
    it("calls onSettled after success", () => {});
  });
  describe("error handling", () => {
    it("calls onRevert on error", () => {});
    it("calls onError with error and workspaceId", () => {});
  });
  describe("empty workspaceId guard", () => {
    it("throws ApiError(400) for empty workspaceId", () => {});
  });
  describe("cleanup", () => {
    it("aborts on unmount", () => {});
  });
  describe("integration — real server", () => {
    it("resumes workspace on running server", () => {});
  });
});
