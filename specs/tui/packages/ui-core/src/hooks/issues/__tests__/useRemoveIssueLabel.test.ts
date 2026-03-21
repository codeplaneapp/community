import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useRemoveIssueLabel } from "../useRemoveIssueLabel.js";

describe("useRemoveIssueLabel", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("client-side validation", () => {
    test("rejects when labelName is empty string", async () => {
      const { result, unmount } = renderHook(() => useRemoveIssueLabel("o", "r"), { apiClient: mockClient });
      try {
        await result.current.mutate(1, "   ");
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain("label name is required");
      }
      unmount();
    });
  });
});
