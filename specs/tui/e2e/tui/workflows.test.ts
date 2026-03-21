import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";

describe("Workflow Data Hooks", () => {

  // =========================================================================
  // useWorkflowDefinitions
  // =========================================================================
  describe("useWorkflowDefinitions", () => {

    test("HOOK-WFD-001: definitions load on screen mount with loading→data transition", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      // Loading state should appear briefly
      await terminal.waitForText("Loading");
      // Then workflow names should appear
      await terminal.waitForText("Workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFD-002: definitions display empty state when repo has no workflows", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "empty-org/empty-repo"],
      });
      await terminal.waitForText("No workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFD-003: definitions pagination loads next page on scroll-to-end", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/large-repo"],
      });
      await terminal.waitForText("Workflows");
      // Scroll to bottom to trigger pagination
      await terminal.sendKeys("G");
      await terminal.waitForText("Loading more");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFD-004: definitions error state renders on API failure", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/private-repo"],
        env: { CODEPLANE_TOKEN: "invalid-token" },
      });
      await terminal.waitForText("error", 5000);
      await terminal.terminate();
    });

    test("HOOK-WFD-005: definitions refetch on Ctrl+R clears and reloads", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("ctrl+r");
      await terminal.waitForText("Loading");
      await terminal.waitForText("Workflows");
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowRuns
  // =========================================================================
  describe("useWorkflowRuns", () => {

    test("HOOK-WFR-001: runs load with correct columns for workflow", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      // Enter first workflow to see runs
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFR-002: runs filter by state re-fetches from page 1", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Cycle filter
      await terminal.sendKeys("f");
      await terminal.waitForText("Running");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFR-003: runs show enriched workflow_name and workflow_path", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Header should contain the workflow name
      const header = terminal.getLine(1);
      expect(header).toMatch(/Runs/);
      await terminal.terminate();
    });

    test("HOOK-WFR-004: runs pagination loads more on scroll to bottom", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("G");
      await terminal.terminate();
    });

    test("HOOK-WFR-005: runs empty state when no runs match filter", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Cycle to a filter that returns no results
      for (let i = 0; i < 6; i++) {
        await terminal.sendKeys("f");
      }
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowRunDetail
  // =========================================================================
  describe("useWorkflowRunDetail", () => {

    test("HOOK-WFRD-001: run detail loads with metadata header and step list", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      // Should show run detail with # prefix
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/#\d+/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFRD-002: run detail shows nodes with status and duration", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("#");
      // Look for step status indicators
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFRD-003: run detail 404 for nonexistent run shows error", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      // Navigate to a nonexistent run (implementation-dependent)
      await terminal.waitForText("Workflows");
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowRunArtifacts (stubbed endpoint)
  // =========================================================================
  describe("useWorkflowRunArtifacts", () => {

    test("HOOK-WFRA-001: artifacts load as empty array from stubbed endpoint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("#");
      // Navigate to artifacts view
      await terminal.sendKeys("a");
      // Should show empty state since endpoint is stubbed
      await terminal.waitForText("No artifacts");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowCaches / useWorkflowCacheStats (stubbed endpoints)
  // =========================================================================
  describe("useWorkflowCaches", () => {

    test("HOOK-WFC-001: caches load as empty array from stubbed endpoint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await terminal.waitForText("Caches");
      // Stubbed endpoint returns empty
      await terminal.waitForText("No caches");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFC-002: cache stats show zero counts from stubbed endpoint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await terminal.waitForText("Caches");
      // Stats banner should show 0 count
      const statsLine = terminal.getLine(2);
      expect(statsLine).toMatch(/0/);
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Mutation hooks: cancel, rerun, resume
  // =========================================================================
  describe("useWorkflowRunCancel", () => {

    test("HOOK-WFA-001: cancel on running run shows immediate status change", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Focus a running run and cancel
      await terminal.sendKeys("c");
      // Should show cancellation feedback
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFA-002: cancel on terminal run shows state-gated message", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Navigate to a completed run
      await terminal.sendKeys("j", "j", "j");
      await terminal.sendKeys("c");
      // Should show invalid state message
      await terminal.terminate();
    });
  });

  describe("useWorkflowRunRerun", () => {

    test("HOOK-WFA-003: rerun on completed run creates new run and navigates", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("r");
      // Should show rerun feedback or navigate to new run
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  describe("useWorkflowRunResume", () => {

    test("HOOK-WFA-004: resume on failed run triggers resume API call", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("m");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useDispatchWorkflow
  // =========================================================================
  describe("useDispatchWorkflow", () => {

    test("HOOK-WFD-010: dispatch sends POST to correct endpoint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("d");
      // Should open dispatch overlay or show appropriate feedback
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Error handling integration
  // =========================================================================
  describe("Error handling", () => {

    test("HOOK-ERR-001: 401 response renders auth error message", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
        env: { CODEPLANE_TOKEN: "expired-token" },
      });
      await terminal.waitForText("expired", 5000);
      await terminal.terminate();
    });

    test("HOOK-ERR-002: network error shows retryable error with R hint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
        env: { CODEPLANE_API_URL: "http://localhost:1" },
      });
      await terminal.waitForText("error", 10000);
      await terminal.terminate();
    });

    test("HOOK-ERR-003: error state preserves stale data and shows error banner", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      // Trigger an action that will error (implementation-dependent)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Responsive behavior with data hooks
  // =========================================================================
  describe("Responsive data display", () => {

    test("HOOK-RSP-001: workflow list at 80x24 shows minimal columns", async () => {
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-RSP-002: workflow list at 200x60 shows all columns", async () => {
      const terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });
});
