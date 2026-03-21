import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useIssueComments } from "../useIssueComments.js";

describe("useIssueComments", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("initial state", () => {
    test("returns empty comments array before fetch completes", async () => {
      mockClient.respondWithJSON(200, [], { "X-Total-Count": "0" });
      const { result, unmount } = renderHook(() => useIssueComments("o", "r", 1), { apiClient: mockClient });
      expect(result.current.comments).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      unmount();
    });
  });
});
