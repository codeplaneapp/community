import { describe, it, expect } from "bun:test";

describe("useCreateWorkspaceSnapshot", () => {
  describe("client-side validation", () => {
    it("rejects empty workspace_id", () => {});
    it("rejects whitespace-only workspace_id", () => {});
    it("validation does not make network request", () => {});
  });
  describe("mutation lifecycle", () => {
    it("sends POST /api/repos/:owner/:repo/workspaces/:id/snapshot", () => {});
    it("includes name in body when provided", () => {});
    it("omits name when undefined", () => {});
    it("returns created snapshot on 201", () => {});
  });
  describe("double-submit prevention", () => {
    it("rejects concurrent create calls", () => {});
  });
  describe("integration — real server", () => {
    it("creates snapshot on running server", () => {});
  });
});
