import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useRepoLabels } from "../useRepoLabels.js";

describe("useRepoLabels", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("fetch lifecycle", () => {
    test("fetches labels", async () => {
      mockClient.respondWithJSON(200, [], { "X-Total-Count": "0" });
      const { result, unmount } = renderHook(() => useRepoLabels("o", "r"), { apiClient: mockClient });
      expect(result.current.labels).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      unmount();
    });
  });
});
