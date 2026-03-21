import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useIssue } from "../useIssue.js";

describe("useIssue", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("initial state", () => {
    test("returns null issue array before fetch completes", async () => {
      mockClient.respondWithJSON(200, { id: 1 });
      const { result, unmount } = renderHook(() => useIssue("o", "r", 1), { apiClient: mockClient });
      expect(result.current.issue).toBeNull();
      expect(result.current.isLoading).toBe(true);
      unmount();
    });
  });

  describe("invalid issueNumber guard", () => {
    test("does not fetch when issueNumber is 0", () => {
      const { result, unmount } = renderHook(() => useIssue("o", "r", 0), { apiClient: mockClient });
      expect(result.current.issue).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(mockClient.calls.length).toBe(0);
      unmount();
    });
  });
});
