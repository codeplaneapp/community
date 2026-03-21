import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useCreateIssueComment } from "../useCreateIssueComment.js";

describe("useCreateIssueComment", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("client-side validation", () => {
    test("rejects when body is empty string", async () => {
      const { result, unmount } = renderHook(() => useCreateIssueComment("o", "r"), { apiClient: mockClient });
      try {
        await result.current.mutate(1, { body: "   " });
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain("comment body is required");
      }
      unmount();
    });
  });
});
