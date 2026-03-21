import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useRepoMilestones } from "../useRepoMilestones.js";

describe("useRepoMilestones", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("fetch lifecycle", () => {
    test("fetches milestones", async () => {
      mockClient.respondWithJSON(200, [], { "X-Total-Count": "0" });
      const { result, unmount } = renderHook(() => useRepoMilestones("o", "r"), { apiClient: mockClient });
      expect(result.current.milestones).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      unmount();
    });
  });
});
