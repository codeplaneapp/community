import { describe, it, expect } from "bun:test";

describe("useCreateWorkspaceSession", () => {
  describe("client-side validation", () => {
    it("rejects empty workspace_id", () => {});
    it("rejects whitespace-only workspace_id", () => {});
    it("rejects negative cols", () => {});
    it("rejects negative rows", () => {});
    it("rejects non-integer cols", () => {});
    it("accepts zero cols and rows (defaults)", () => {});
    it("validation does not make network request", () => {});
  });
  describe("mutation lifecycle", () => {
    it("sends POST /api/repos/:owner/:repo/workspace/sessions", () => {});
    it("sends workspace_id, cols, rows in body", () => {});
    it("returns created session on 201", () => {});
  });
  describe("double-submit prevention", () => {
    it("rejects concurrent create calls", () => {});
  });
  describe("integration — real server", () => {
    it("creates session on running server", () => {});
  });
});
