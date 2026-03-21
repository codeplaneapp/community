import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useIssues } from "../useIssues.js";

describe("useIssues", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("initial state", () => {
    test("returns empty issues array before fetch completes", async () => {
      mockClient.respondWithJSON(200, [], { "X-Total-Count": "0" });
      const { result, unmount } = renderHook(() => useIssues("o", "r"), { apiClient: mockClient });
      expect(result.current.issues).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
      unmount();
    });
  });

  describe("fetch lifecycle", () => {
    test("fetches /api/repos/:owner/:repo/issues with page=1&per_page=30", async () => {
      mockClient.respondWithJSON(200, [{ id: 1, state: "open" }], { "X-Total-Count": "10" });
      const { result, waitForNextUpdate, unmount } = renderHook(() => useIssues("o", "r"), { apiClient: mockClient });
      
      let iters = 0;
      while (result.current.isLoading && iters < 20) {
        await waitForNextUpdate();
        iters++;
      }
      
      expect(mockClient.calls[0].path).toBe("/api/repos/o/r/issues?page=1&per_page=30");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.totalCount).toBe(10);
      expect(result.current.issues[0].id).toBe(1);
      unmount();
    });
  });
});
