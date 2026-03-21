import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useRepoCollaborators } from "../useRepoCollaborators.js";

describe("useRepoCollaborators", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("empty query guard", () => {
    test("does not fetch when query is empty string", () => {
      const { result, unmount } = renderHook(() => useRepoCollaborators("o", "r", { query: "" }), { apiClient: mockClient });
      expect(result.current.users).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(mockClient.calls.length).toBe(0);
      unmount();
    });
  });
});
