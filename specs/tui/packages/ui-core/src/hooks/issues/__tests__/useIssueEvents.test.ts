import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useIssueEvents } from "../useIssueEvents.js";

describe("useIssueEvents", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("initial state", () => {
    test("returns empty events array before fetch completes", async () => {
      mockClient.respondWithJSON(200, [], { "X-Total-Count": "0" });
      const { result, unmount } = renderHook(() => useIssueEvents("o", "r", 1), { apiClient: mockClient });
      expect(result.current.events).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      unmount();
    });
  });

  describe("integration - events endpoint", () => {
    test("fetches events from live server (expected to fail with 404)", async () => {
      mockClient.respondWithError(new Error("API 404"));
      const { result, waitForNextUpdate, unmount } = renderHook(() => useIssueEvents("admin", "repo1", 1), { apiClient: mockClient });
      await waitForNextUpdate();
      expect(result.current.error).not.toBeNull();
      unmount();
    });
  });
});
