import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useUpdateIssue } from "../useUpdateIssue.js";

describe("useUpdateIssue", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("mutation lifecycle", () => {
    test("sends PATCH /api/repos/:owner/:repo/issues/:number", async () => {
      mockClient.respondWithJSON(200, { id: 1, title: "new" });
      const { result, unmount } = renderHook(() => useUpdateIssue("o", "r"), { apiClient: mockClient });
      await result.current.mutate(1, { title: "new" });
      expect(mockClient.calls[0].path).toBe("/api/repos/o/r/issues/1");
      unmount();
    });
  });
});
