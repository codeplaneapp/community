import { describe, it, expect } from "bun:test";

describe("useWorkspaceSnapshots", () => {
  describe("initial state", () => {
    it("returns empty snapshots array before fetch", () => {});
    it("isLoading is true on mount", () => {});
  });
  describe("fetch lifecycle", () => {
    it("fetches GET /api/repos/:owner/:repo/workspace-snapshots on mount", () => {});
    it("populates snapshots from response body", () => {});
    it("reads X-Total-Count header", () => {});
  });
  describe("pagination", () => {
    it("fetchMore sends page=2", () => {});
    it("caps perPage at 100", () => {});
  });
  describe("cleanup", () => {
    it("aborts on unmount", () => {});
  });
  describe("integration — real server", () => {
    it("fetches snapshots from running server", () => {});
  });
});
