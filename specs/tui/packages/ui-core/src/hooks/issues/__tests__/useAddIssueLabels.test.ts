import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useAddIssueLabels } from "../useAddIssueLabels.js";

describe("useAddIssueLabels", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("client-side validation", () => {
    test("rejects when labelNames is empty array", async () => {
      const { result, unmount } = renderHook(() => useAddIssueLabels("o", "r"), { apiClient: mockClient });
      try {
        await result.current.mutate(1, []);
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain("at least one label name is required");
      }
      unmount();
    });
  });
});
