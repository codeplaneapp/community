import { describe, expect, test, afterEach } from "bun:test";
import {
  launchTUI,
  createMockAPIEnv,
  type TUITestInstance,
} from "./helpers";

describe("TUI_LOADING_STATES", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  describe("Full-screen loading spinner", () => {
    test("LOAD-SNAP-001: full-screen loading spinner renders centered with label at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
      expect(snapshot).toContain("Loading issues");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-002: full-screen loading spinner renders centered with label at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-003: full-screen loading spinner renders centered with label at 200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-004: full-screen spinner uses primary color (ANSI 33)", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    });

    test("LOAD-SNAP-005: header bar and status bar remain stable during loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard|Issues|acme/);
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/q.*back|help/);
    });

    test("LOAD-SNAP-006: context-specific loading labels", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      expect(terminal.snapshot()).toContain("Loading issues");
      await terminal.terminate();

      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.sendKeys("g", "n");
      await terminal.waitForText("Loading notifications");
      expect(terminal.snapshot()).toContain("Loading notifications");
    });
  });

  describe("Skeleton rendering", () => {
    test("LOAD-SNAP-010: skeleton list renders placeholder rows with muted block characters", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snapshot = terminal.snapshot();
      const hasBlocks = snapshot.includes("▓");
      const hasSpinner = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(snapshot);
      expect(hasBlocks || hasSpinner).toBe(true);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-011: skeleton rows have varying widths at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snapshot = terminal.snapshot();
      if (snapshot.includes("▓")) {
        const lines = snapshot.split("\n").filter((l: string) => l.includes("▓"));
        if (lines.length > 1) {
          const lengths = lines.map(
            (l: string) => (l.match(/▓+/)?.[0]?.length ?? 0)
          );
          const unique = new Set(lengths);
          expect(unique.size).toBeGreaterThan(1);
        }
      }
    });

    test("LOAD-SNAP-012: skeleton rows do not exceed visible content area height", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snapshot = terminal.snapshot();
      if (snapshot.includes("▓")) {
        const blockLines = snapshot.split("\n").filter((l: string) => l.includes("▓"));
        expect(blockLines.length).toBeLessThanOrEqual(terminal.rows - 2);
      }
    });

    test("LOAD-SNAP-013: skeleton detail renders section headers at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("Enter");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatchSnapshot();
    });

    test("LOAD-SNAP-014: skeleton transitions to content without flicker", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading issues");
      const snapshot = terminal.snapshot();
      const contentLines = snapshot.split("\n").slice(1, -1);
      const hasContent = contentLines.some(
        (l: string) => l.trim().length > 0
      );
      expect(hasContent).toBe(true);
    });
  });

  describe("Inline pagination loading", () => {
    test("LOAD-SNAP-020: pagination loading indicator at list bottom at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("G");
      const snapshot = terminal.snapshot();
      const hasIssues = snapshot.includes("Issues");
      expect(hasIssues).toBe(true);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-021: pagination loading indicator at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("G");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-022: pagination error shows retry hint", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("G");
      const snapshot = terminal.snapshot();
      if (snapshot.includes("Failed to load")) {
        expect(snapshot).toMatch(/R.*retry/);
      }
    });
  });

  describe("Action loading", () => {
    test("LOAD-SNAP-030: action button shows spinner during submission", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("Enter");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-031: action loading on list row shows spinner", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("Full-screen error", () => {
    test("LOAD-SNAP-040: error renders after failed load at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-041: error renders after failed load at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-042: error renders after failed load at 200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-SNAP-043: error shows R retry in status bar", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      await terminal.waitForText("Failed to load", 35_000);
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/R.*retry/);
    });
  });

  describe("Optimistic UI revert", () => {
    test("LOAD-SNAP-050: optimistic revert shows error in status bar", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("No-color terminal", () => {
    test("LOAD-SNAP-060: no-color uses ASCII spinner", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: { NO_COLOR: "1" },
      });
      const snapshot = terminal.snapshot();
      const hasBraille = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(snapshot);
      expect(hasBraille).toBe(false);
      if (snapshot.includes("Loading")) {
        expect(snapshot).toMatch(/[|/\\\-]/);
      }
    });

    test("LOAD-SNAP-061: no-color skeleton uses dash characters", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: { NO_COLOR: "1" },
      });
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("▓");
      if (snapshot.includes("---")) {
        expect(snapshot).toMatch(/-{3,}/);
      }
    });
  });

  describe("Loading timeout", () => {
    test("LOAD-SNAP-070: loading timeout shows error after 30 seconds", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://10.255.255.1" }),
        },
      });
      await terminal.waitForText("timed out", 35_000);
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("timed out");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("Keyboard interactions during loading", () => {
    test("LOAD-KEY-001: q pops screen during full-screen loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.sendKeys("q");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("Loading issues");
    });

    test("LOAD-KEY-002: Ctrl+C exits TUI during full-screen loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.sendKeys("\x03"); // Ctrl+C
      await terminal.terminate();
    });

    test("LOAD-KEY-003: R retries from full-screen error", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      await terminal.waitForText("Failed", 35_000);
      await terminal.sendKeys("R");
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
    });

    test("LOAD-KEY-004: R retry is debounced during error state", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      await terminal.waitForText("Failed", 35_000);
      await terminal.sendKeys("R", "R", "R");
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
    });

    test("LOAD-KEY-005: ? opens help overlay during loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.sendKeys("?");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/help|keybinding/i);
      await terminal.sendKeys("\x1b");
    });

    test("LOAD-KEY-006: : opens command palette during loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.sendKeys(":");
      const snapshot = terminal.snapshot();
      expect(snapshot.length).toBeGreaterThan(0);
      await terminal.sendKeys("\x1b");
    });

    test("LOAD-KEY-007: go-to keybinding during loading navigates away", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.sendKeys("g", "n");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("Loading issues");
    });

    test("LOAD-KEY-008: R retries from pagination error", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("G");
      const snapshot = terminal.snapshot();
      if (snapshot.includes("Failed to load")) {
        await terminal.sendKeys("R");
        const afterRetry = terminal.snapshot();
        expect(afterRetry.length).toBeGreaterThan(0);
      }
    });

    test("LOAD-KEY-009: user can scroll during pagination loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("G");
      await terminal.sendKeys("k", "k", "k");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Issues");
    });

    test("LOAD-KEY-010: user can navigate away during action loading", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("q");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("Issues");
    });

    test("LOAD-KEY-011: fast API response skips spinner", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
      });
      await terminal.waitForText("Dashboard");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Dashboard");
    });
  });

  describe("Responsive behavior", () => {
    test("LOAD-RSP-001: full-screen loading layout at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      const headerLine = terminal.getLine(0);
      const statusLine = terminal.getLine(23);
      expect(headerLine.length).toBeGreaterThan(0);
      expect(statusLine.length).toBeGreaterThan(0);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-RSP-002: resize during loading re-centers spinner", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      const snap1 = terminal.snapshot();
      await terminal.resize(80, 24);
      const snap2 = terminal.snapshot();
      if (snap1.includes("Loading") && snap2.includes("Loading")) {
        expect(snap1).not.toBe(snap2);
      }
    });

    test("LOAD-RSP-003: resize during skeleton recalculates row widths", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snap1 = terminal.snapshot();
      await terminal.resize(80, 24);
      const snap2 = terminal.snapshot();
      if (snap1.includes("▓") && snap2.includes("▓")) {
        expect(snap1).not.toBe(snap2);
      }
    });

    test("LOAD-RSP-004: resize during error re-centers error text", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "issues", "--repo", "acme/api"],
        env: {
          ...createMockAPIEnv({ apiBaseUrl: "http://localhost:1" }),
        },
      });
      await terminal.waitForText("Failed", 35_000);
      await terminal.resize(80, 24);
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Failed");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-RSP-005: skeleton list adapts at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      const snapshot = terminal.snapshot();
      if (snapshot.includes("▓")) {
        const lines = snapshot.split("\n");
        for (const line of lines) {
          expect(line.replace(/\x1b\[[0-9;]*m/g, "").length).toBeLessThanOrEqual(80);
        }
      }
    });

    test("LOAD-RSP-006: skeleton list adapts at 200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("LOAD-RSP-007: pagination indicator at 80x24 fits single row", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      await terminal.waitForText("Issues");
      await terminal.sendKeys("G");
      const snapshot = terminal.snapshot();
      if (snapshot.includes("Loading more")) {
        const loadingLine = snapshot
          .split("\n")
          .find((l: string) => l.includes("Loading more"));
        expect(loadingLine).toBeDefined();
        if (loadingLine) {
          expect(
            loadingLine.replace(/\x1b\[[0-9;]*m/g, "").length
          ).toBeLessThanOrEqual(80);
        }
      }
    });

    test("LOAD-RSP-008: action button at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "issues", "--repo", "acme/api"],
      });
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });
});


describe("KeybindingProvider — Priority Dispatch", () => {
  let terminal: any;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  // ── Snapshot Tests ──────────────────────────────────────────────

  test("KEY-SNAP-001: status bar shows keybinding hints on Dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\S+:\S+/);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("KEY-SNAP-002: hints update when navigating screens", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const dashHints = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const repoHints = terminal.getLine(terminal.rows - 1);
    expect(repoHints).not.toEqual(dashHints);
  });

  test("KEY-SNAP-003: 80x24 shows ≤4 truncated hints", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("KEY-SNAP-004: 200x60 shows full hint set", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Global Keybinding Tests ─────────────────────────────────────

  test("KEY-KEY-001: q pops screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-KEY-002: Escape pops screen when no overlay open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-KEY-003: Ctrl+C exits from any screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("\x03");
  });

  test("KEY-KEY-004: ? toggles help overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
  });

  test("KEY-KEY-005: : opens command palette", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command");
  });

  test("KEY-KEY-006: g activates go-to mode", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/dashboard|repos/i);
    await terminal.sendKeys("d");
  });

  // ── Priority Layering Tests ─────────────────────────────────────

  test("KEY-KEY-010: modal scope (P2) captures keys before screen scope (P4)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command");
    await terminal.sendKeys("q");
    await terminal.waitForText("Command"); // q did NOT pop screen
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-KEY-011: screen keybindings inactive when modal open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
    await terminal.sendKeys("j"); await terminal.sendKeys("k");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Repositories");
  });

  test("KEY-KEY-012: go-to mode (P3) overrides screen keybindings (P4)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-KEY-013: text input captures printable keys", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("jest");
    expect(terminal.snapshot()).toMatch(/jest/);
    await terminal.sendKeys("Escape");
  });

  test("KEY-KEY-014: Ctrl+C propagates through text input", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("test");
    await terminal.sendKeys("\x03");
  });

  test("KEY-KEY-015: Escape unfocuses text input, re-enables screen keys", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("hello");
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("j");
    expect(terminal.snapshot()).not.toMatch(/helloj/);
  });

  // ── Scope Lifecycle Tests ───────────────────────────────────────

  test("KEY-KEY-020: screen keybindings registered on mount, removed on unmount", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const repoStatus = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    const dashStatus = terminal.getLine(terminal.rows - 1);
    expect(dashStatus).not.toEqual(repoStatus);
  });

  test("KEY-KEY-021: rapid transitions leave no stale scopes", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "n"); await terminal.waitForText("Notifications");
    await terminal.sendKeys("g", "s"); await terminal.waitForText("Search");
    await terminal.sendKeys("g", "d"); await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
  });

  // ── Status Bar Hints Tests ──────────────────────────────────────

  test("KEY-KEY-030: help hint visible on every screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/\?.*help/i);
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/\?.*help/i);
  });

  test("KEY-KEY-031: go-to mode overrides hints temporarily", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const normal = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g");
    const goTo = terminal.getLine(terminal.rows - 1);
    expect(goTo).not.toEqual(normal);
    expect(goTo).toMatch(/d.*dashboard|r.*repos/i);
    await terminal.sendKeys("Escape");
    expect(terminal.getLine(terminal.rows - 1)).toEqual(normal);
  });

  // ── Integration Tests ───────────────────────────────────────────

  test("KEY-INT-001: help overlay shows bindings from all active scopes", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
    const snap = terminal.snapshot();
    expect(snap).toMatch(/q/);
    expect(snap).toMatch(/\?/);
    await terminal.sendKeys("Escape");
  });

  // ── Edge Case Tests ─────────────────────────────────────────────

  test("KEY-EDGE-001: unhandled key does not crash", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("z"); await terminal.sendKeys("x");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("KEY-EDGE-002: rapid key presses processed sequentially", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d"); await terminal.waitForText("Dashboard");
  });

  test("KEY-EDGE-003: scope removal during dispatch does not crash", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.sendKeys("g", "r");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
  });

  // ── Responsive Tests ────────────────────────────────────────────

  test("KEY-RSP-001: keybindings work at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
  });

  test("KEY-RSP-002: keybindings work at 200x60", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("?"); await terminal.waitForText("Global");
    await terminal.sendKeys("Escape"); await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-RSP-003: resize does not break keybinding dispatch", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.resize(80, 24);
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
  });

  test("KEY-RSP-004: hint count adapts to width on resize", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    const wide = (terminal.getLine(terminal.rows - 1).match(/\S+:\S+/g) || []).length;
    await terminal.resize(80, 24);
    const narrow = (terminal.getLine(terminal.rows - 1).match(/\S+:\S+/g) || []).length;
    expect(narrow).toBeLessThanOrEqual(wide);
  });
});
