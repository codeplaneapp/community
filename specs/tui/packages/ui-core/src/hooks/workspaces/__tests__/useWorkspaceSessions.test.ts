import { describe, it, expect } from "bun:test";

describe("useWorkspaceSessions", () => {
  describe("initial state", () => {
    it("returns empty sessions array before fetch", () => {});
    it("isLoading is true on mount", () => {});
  });
  describe("fetch lifecycle", () => {
    it("fetches GET /api/repos/:owner/:repo/workspace/sessions on mount", () => {});
    it("filters sessions by workspace_id client-side", () => {});
    it("returns all sessions when workspaceId is empty", () => {});
    it("reads X-Total-Count header", () => {});
  });
  describe("pagination", () => {
    it("fetchMore appends and filters", () => {});
    it("caps perPage at 100", () => {});
  });
  describe("param changes", () => {
    it("changing workspaceId resets and re-fetches", () => {});
  });
  describe("enabled option", () => {
    it("forced disabled when workspaceId is empty", () => {});
  });
  describe("cleanup", () => {
    it("aborts on unmount", () => {});
  });
  describe("integration — real server", () => {
    it("fetches sessions from running server", () => {});
  });
});
