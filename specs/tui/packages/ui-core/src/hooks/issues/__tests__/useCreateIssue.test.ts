import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useCreateIssue } from "../useCreateIssue.js";

describe("useCreateIssue", () => {
  let mockClient = createMockAPIClient();

  beforeEach(() => {
    mockClient.reset();
  });

  describe("client-side validation", () => {
    test("rejects when title is empty string", async () => {
      const { result, unmount } = renderHook(() => useCreateIssue("o", "r"), { apiClient: mockClient });
      try {
        await result.current.mutate({ title: "   ", body: "body" });
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message).toContain("title is required");
      }
      unmount();
    });
  });
});
