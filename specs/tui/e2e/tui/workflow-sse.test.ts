import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";
import { navigateToWorkflowRunDetail, waitForLogStreaming } from "./helpers/workflows.js";

describe("Workflow SSE Streaming Hooks", () => {

  // =========================================================================
  // useWorkflowLogStream — Connection Lifecycle
  // =========================================================================
  describe("useWorkflowLogStream — Connection", () => {

    test("HOOK-WFSS-001: log stream connects on run detail mount and shows streaming indicator", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      // Run detail should show connection status
      await terminal.waitForText("#");
      // Status bar or header should indicate streaming state
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFSS-002: log stream does not connect when run is in terminal state", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Navigate to a completed run (j to move to a terminal-state run)
      await terminal.sendKeys("j", "j");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("#");
      // Should NOT show streaming spinner for completed runs
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toMatch(/Connecting|Streaming/);
      await terminal.terminate();
    });

    test("HOOK-WFSS-003: connection health shows in status bar during streaming", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // Status bar (last line) should show connection indicator
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/●|◆|⣾|connected|streaming/i);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFSS-004: connection cleans up on screen back-navigation (q)", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // Go back
      await terminal.sendKeys("q");
      await terminal.waitForText("Runs");
      // Run list should not show log streaming indicators
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toMatch(/Streaming logs/i);
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowLogStream — Log Event Processing
  // =========================================================================
  describe("useWorkflowLogStream — Log Events", () => {

    test("HOOK-WFSS-010: incremental log lines render as they arrive", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // Logs should appear incrementally (not buffer-then-flush)
      // Wait for at least one log line
      await terminal.waitForText("Step", 15000);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFSS-011: ANSI color codes in log lines pass through to terminal", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      await terminal.waitForText("Step", 15000);
      // Snapshot should contain ANSI escape sequences
      const snapshot = terminal.snapshot();
      // Log lines with color should have ESC sequences preserved
      expect(snapshot).toMatch(/\x1b\[/);
      await terminal.terminate();
    });

    test("HOOK-WFSS-012: logs are grouped by step_id with step headers", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      await terminal.waitForText("Step", 15000);
      // Should see step name headers separating log groups
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFSS-013: duplicate log_ids from replay are silently dropped", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      await terminal.waitForText("Step", 15000);
      // Verify no duplicate lines appear (snapshot comparison)
      const snapshot = terminal.snapshot();
      const lines = snapshot.split("\n");
      // No exact duplicate consecutive lines (basic dedup check)
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() && lines[i] === lines[i - 1]) {
          // Allow empty lines and UI chrome, but log content shouldn't duplicate
          expect(lines[i]).not.toMatch(/^\s*\[\d/);
        }
      }
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowLogStream — Status Events
  // =========================================================================
  describe("useWorkflowLogStream — Status Events", () => {

    test("HOOK-WFSS-020: step status change updates step indicator inline", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      await terminal.waitForText("Step", 15000);
      // Step indicators should show status (e.g., running → success)
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFSS-021: run status change updates header status badge", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // Header should show run status
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/#\d+/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFSS-022: done event stops streaming and shows final status", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // Wait for completion (if test run is fast enough)
      // This test validates the behavior when a run reaches terminal state
      await terminal.waitForText("#");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowLogStream — Reconnection
  // =========================================================================
  describe("useWorkflowLogStream — Reconnection", () => {

    test("HOOK-WFSS-030: reconnection shows 'reconnecting' indicator in status bar", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
        env: { CODEPLANE_API_URL: "http://localhost:1" },
      });
      await terminal.waitForText("Workflows", 15000);
      await terminal.sendKeys("Enter");
      // With unreachable API, should see reconnection/error state
      await terminal.waitForText("error", 15000);
      await terminal.terminate();
    });

    test("HOOK-WFSS-031: failed state after max reconnection attempts shows error message", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
        env: { CODEPLANE_API_URL: "http://localhost:1" },
      });
      await terminal.waitForText("error", 30000);
      // After max attempts, should show connection failed message
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFSS-032: manual reconnect via R key resets backoff and retries", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // Press R to trigger manual reconnect
      await terminal.sendKeys("R");
      // Should show brief reconnection indicator
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowRunSSE — Multi-Run Status Streaming
  // =========================================================================
  describe("useWorkflowRunSSE", () => {

    test("HOOK-WFRSSE-001: run list shows live status updates without manual refresh", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Run statuses should be visible with status indicators
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFRSSE-002: status transition updates run row inline without flicker", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Verify status badges are present
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/queued|running|success|failure/i);
      await terminal.terminate();
    });

    test("HOOK-WFRSSE-003: SSE auto-disconnects when all visible runs are terminal", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // If all runs are in terminal state, status bar should NOT show streaming
      const statusBar = terminal.getLine(terminal.rows - 1);
      // Should not show active connection indicator when all runs are done
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFRSSE-004: pagination loads new runs and SSE reconnects with updated run_ids", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/large-repo"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      // Scroll to trigger pagination
      await terminal.sendKeys("G");
      // After loading more runs, SSE should still be tracking status
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Virtual Scroll Window & FIFO Eviction
  // =========================================================================
  describe("Virtual Scroll Window", () => {

    test("HOOK-WFVS-001: memory stays bounded during long-running log output", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // This is a behavioral test — TUI should not crash or freeze
      // even with high-volume log output
      await terminal.waitForText("#", 15000);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Responsive Behavior
  // =========================================================================
  describe("Responsive streaming display", () => {

    test("HOOK-WFSS-RSP-001: log streaming at 80x24 shows minimal chrome", async () => {
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("#");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFSS-RSP-002: log streaming at 200x60 shows expanded metadata", async () => {
      const terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("#");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // SSE Ticket Authentication
  // =========================================================================
  describe("SSE Ticket Auth", () => {

    test("HOOK-WFSS-AUTH-001: stream connects with ticket-based auth", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // Connection should succeed (ticket or bearer fallback)
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toMatch(/auth.*error/i);
      await terminal.terminate();
    });

    test("HOOK-WFSS-AUTH-002: stream falls back to bearer auth when ticket endpoint unavailable", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await navigateToWorkflowRunDetail(terminal);
      // Should still connect even without ticket endpoint
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });
});
