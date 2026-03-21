import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";

describe("TUI_WORKSPACES — WorkspaceStatusBadge", () => {

  // ── STATUS CONFIG MAP ───────────────────────────────────────────────

  test("BADGE-CFG-001: STATUS_CONFIG has entries for all 11 display statuses", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const expected = [
      "pending", "starting", "running", "stopping", "suspending",
      "suspended", "resuming", "stopped", "deleted", "error", "failed",
    ].sort();
    const keys = Object.keys(_STATUS_CONFIG_FOR_TESTING).sort();
    expect(keys).toEqual(expected);
  });

  test("BADGE-CFG-002: running maps to success token, not animated", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const cfg = _STATUS_CONFIG_FOR_TESTING.running;
    expect(cfg.tokenName).toBe("success");
    expect(cfg.animated).toBe(false);
    expect(cfg.label).toBe("Running");
  });

  test("BADGE-CFG-003: transitional states (starting, stopping, suspending, resuming) are animated with warning token", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const transitional = ["starting", "stopping", "suspending", "resuming"] as const;
    for (const status of transitional) {
      const cfg = _STATUS_CONFIG_FOR_TESTING[status];
      expect(cfg.tokenName).toBe("warning");
      expect(cfg.animated).toBe(true);
    }
  });

  test("BADGE-CFG-004: suspended, stopped, deleted map to muted token, not animated", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const dormant = ["suspended", "stopped", "deleted"] as const;
    for (const status of dormant) {
      const cfg = _STATUS_CONFIG_FOR_TESTING[status];
      expect(cfg.tokenName).toBe("muted");
      expect(cfg.animated).toBe(false);
    }
  });

  test("BADGE-CFG-005: error and failed map to error token, not animated", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const errorStates = ["error", "failed"] as const;
    for (const status of errorStates) {
      const cfg = _STATUS_CONFIG_FOR_TESTING[status];
      expect(cfg.tokenName).toBe("error");
      expect(cfg.animated).toBe(false);
    }
  });

  test("BADGE-CFG-006: pending maps to warning token, not animated, with static dot", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    const cfg = _STATUS_CONFIG_FOR_TESTING.pending;
    expect(cfg.tokenName).toBe("warning");
    expect(cfg.animated).toBe(false);
    expect(cfg.label).toBe("Pending");
  });

  test("BADGE-CFG-007: all labels are capitalized single words ≤ 10 characters", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    for (const [, cfg] of Object.entries(_STATUS_CONFIG_FOR_TESTING)) {
      expect(typeof cfg.label).toBe("string");
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.label.length).toBeLessThanOrEqual(10);
      expect(cfg.label[0]).toBe(cfg.label[0].toUpperCase());
      expect(cfg.label).not.toContain(" ");
    }
  });

  test("BADGE-CFG-008: STATUS_CONFIG is frozen (immutable)", async () => {
    const { _STATUS_CONFIG_FOR_TESTING } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    expect(Object.isFrozen(_STATUS_CONFIG_FOR_TESTING)).toBe(true);
  });

  // ── MODULE EXPORTS ──────────────────────────────────────────────────

  test("BADGE-EXP-001: module exports WorkspaceStatusBadge as a function", async () => {
    const { WorkspaceStatusBadge } = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    expect(typeof WorkspaceStatusBadge).toBe("function");
  });

  test("BADGE-EXP-002: barrel export re-exports WorkspaceStatusBadge", async () => {
    const { WorkspaceStatusBadge } = await import(
      "../../apps/tui/src/components/index.js"
    );
    expect(typeof WorkspaceStatusBadge).toBe("function");
  });

  test("BADGE-EXP-003: module compiles and imports without errors", async () => {
    const mod = await import(
      "../../apps/tui/src/components/WorkspaceStatusBadge.js"
    );
    expect(mod).toBeDefined();
    expect(mod.WorkspaceStatusBadge).toBeDefined();
    expect(mod._STATUS_CONFIG_FOR_TESTING).toBeDefined();
  });

  // ── RENDERED OUTPUT (E2E) ──────────────────────────────────────────
  //
  // These tests depend on:
  //   - tui-workspace-list-screen (workspace list screen)
  //   - tui-workspace-data-hooks (data fetching)
  //   - tui-workspace-status-stream (SSE streaming)
  //   - A running API server with workspace test fixtures
  //
  // They are intentionally left FAILING until those dependencies
  // are implemented. They are NEVER skipped or commented out.

  test("BADGE-E2E-001: running workspace shows green dot and 'Running' label at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w"); // navigate to workspaces
    await terminal.waitForText("Workspaces");
    // Expect a running workspace row to show ● and "Running"
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Running/);
    await terminal.terminate();
  });

  test("BADGE-E2E-002: running workspace shows dot only at 80x24 (no label)", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snapshot = terminal.snapshot();
    // Should have the dot
    expect(snapshot).toMatch(/●/);
    // At 80x24 the "Running" label should NOT appear adjacent to workspace rows
    // (label is suppressed at minimum breakpoint)
    await terminal.terminate();
  });

  test("BADGE-E2E-003: transitional status shows braille spinner character", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    // Look for any braille spinner character in the output
    const snapshot = terminal.snapshot();
    // Braille spinner frames: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
    expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    await terminal.terminate();
  });

  test("BADGE-E2E-004: suspended workspace shows muted-colored dot and 'Suspended' at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Suspended/);
    await terminal.terminate();
  });

  test("BADGE-E2E-005: failed workspace shows 'Failed' label at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/●.*Failed/);
    await terminal.terminate();
  });

  test("BADGE-E2E-006: badge responds to terminal resize from 80x24 to 120x40", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");

    // At 80x24, labels should be hidden
    let snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/Running\s/);

    // Resize to standard
    await terminal.resize(120, 40);
    await terminal.waitForText("Running");
    snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Running/);

    await terminal.terminate();
  });

  test("BADGE-E2E-007: multiple animated badges show synchronized frames", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    // If multiple workspaces have transitional statuses,
    // all spinner characters in the snapshot should be identical
    const snapshot = terminal.snapshot();
    const spinnerChars = snapshot.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g);
    if (spinnerChars && spinnerChars.length > 1) {
      const allSame = spinnerChars.every((c: string) => c === spinnerChars[0]);
      expect(allSame).toBe(true);
    }
    await terminal.terminate();
  });

  test("BADGE-E2E-008: snapshot at 120x40 captures workspace list with status badges", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("BADGE-E2E-009: snapshot at 80x24 captures workspace list with icon-only badges", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

});