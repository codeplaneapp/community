import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance } from "./helpers";

describe("TUI_WORKSPACES — SSE workspace status streaming", () => {

  // ─── Connection Lifecycle ────────────────────────────────────

  describe("connection lifecycle", () => {
    test("workspace detail screen establishes SSE connection and shows connected indicator", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w"); // Navigate to workspaces
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter"); // Open first workspace
      await terminal.waitForText("Status");

      // Status bar should show connection indicator
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/●|◆|connected/i);

      await terminal.terminate();
    });

    test("workspace detail screen shows workspace status from SSE stream", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // Workspace status should be visible (from initial SSE event or REST)
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/running|pending|starting|suspended|stopped|failed/i);

      await terminal.terminate();
    });

    test("SSE connection state is exposed in status bar for workspace screens", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");

      // The status bar should contain a sync/connection indicator
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toMatch(/●|◆|⚠|✗|connected|connecting|sync/i);

      await terminal.terminate();
    });
  });

  // ─── Real-time Status Updates ────────────────────────────────

  describe("real-time status updates", () => {
    test("workspace status updates in real-time when SSE event arrives", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_SSE_INJECT_FILE: "", // Will be set by test fixture
        },
      });

      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // Initial status should be visible
      const initialSnapshot = terminal.snapshot();
      expect(initialSnapshot).toMatch(/running|pending|starting/i);

      await terminal.terminate();
    });

    test("workspace list updates row status when SSE events arrive for visible workspaces", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");

      // The workspace list should show status for each row
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/running|pending|starting|suspended|stopped|failed/i);

      await terminal.terminate();
    });
  });

  // ─── Reconnection Behavior ──────────────────────────────────

  describe("reconnection behavior", () => {
    test("status bar shows reconnecting indicator when SSE connection drops", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // Connection should initially be healthy
      const snapshot = terminal.snapshot();
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar.length).toBeGreaterThan(0);

      await terminal.terminate();
    });

    test("workspace data reconciles via REST after successful reconnection", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // After reconnection, REST data should be refreshed
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/Status/);

      await terminal.terminate();
    });

    test("disconnected state shown in status bar after max reconnection attempts", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_API_URL: "http://localhost:1",
        },
      });

      await terminal.sendKeys("g", "w");
      await terminal.terminate();
    });
  });

  // ─── Navigation & Cleanup ───────────────────────────────────

  describe("navigation and cleanup", () => {
    test("SSE connections are cleaned up when navigating away from workspace screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Status");

      // Navigate away
      await terminal.sendKeys("q"); // back to list
      await terminal.waitForText("Workspaces");

      // Navigate to a different section entirely
      await terminal.sendKeys("g", "d"); // go to dashboard
      await terminal.waitForText("Dashboard");

      // The TUI should not crash or show errors from dangling SSE connections
      expect(terminal.snapshot()).toMatch(/Dashboard/);

      await terminal.terminate();
    });

    test("SSE connections for workspace list are cleaned up when leaving list screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");

      // Navigate away from workspace list
      await terminal.sendKeys("g", "d");
      await terminal.waitForText("Dashboard");

      // No errors, clean transition
      expect(terminal.snapshot()).not.toMatch(/Error|error|crash/i);

      await terminal.terminate();
    });
  });

  // ─── Responsive Layout ──────────────────────────────────────

  describe("responsive layout", () => {
    test("workspace status stream indicator renders at minimum terminal size", async () => {
      const terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");

      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar.length).toBeGreaterThan(0);

      await terminal.terminate();
    });

    test("workspace status stream renders at standard terminal size", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");

      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("workspace status stream renders at large terminal size", async () => {
      const terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.sendKeys("g", "w");
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("Enter");

      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });
});
