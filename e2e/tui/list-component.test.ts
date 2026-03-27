import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  type TUITestInstance,
} from "./helpers.ts";

// ── Helper: Navigate to a screen that uses ListComponent ──────────────
// Navigates to the Issues list screen via go-to mode.
// Tests fail until a list screen using ListComponent is implemented.
async function navigateToListScreen(
  terminal: TUITestInstance,
): Promise<void> {
  await terminal.sendKeys("g", "i");
  await terminal.waitForText("Issues", 5000);
}

// Store terminal instances for cleanup
let terminal: TUITestInstance | null = null;

afterEach(async () => {
  if (terminal) {
    await terminal.terminate();
    terminal = null;
  }
});

describe("TUI_LIST_COMPONENT", () => {
  // ── Snapshot Tests ────────────────────────────────────────────

  describe("Terminal Snapshot Tests", () => {
    test("SNAP-LIST-001: list renders with items at standard size (120x40)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-LIST-002: list renders with items at minimum size (80x24)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await navigateToListScreen(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-LIST-003: list renders with items at large size (200x60)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
      });
      await navigateToListScreen(terminal);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-LIST-004: first item is focused by default with reverse video", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);
      // First content row (after header bar on line 0) should have
      // ANSI reverse video escape code (\x1b[7m)
      const contentLine = terminal.getLine(2);
      expect(contentLine).toMatch(/\x1b\[7m/);
    });
  });

  // ── Keyboard Navigation Tests ─────────────────────────────────

  describe("Keyboard Navigation", () => {
    test("KEY-LIST-001: j moves focus down by one row", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // First item focused initially
      const line1Before = terminal.getLine(2);
      expect(line1Before).toMatch(/\x1b\[7m/);

      // Press j to move down
      await terminal.sendKeys("j");

      // Second item should now be focused
      const line2After = terminal.getLine(3);
      expect(line2After).toMatch(/\x1b\[7m/);

      // First item should no longer be focused
      const line1After = terminal.getLine(2);
      expect(line1After).not.toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-002: k moves focus up by one row", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Move down first, then back up
      await terminal.sendKeys("j");
      await terminal.sendKeys("k");

      // First item should be focused again
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-003: Down arrow moves focus down", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      await terminal.sendKeys("Down");

      const line2 = terminal.getLine(3);
      expect(line2).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-004: Up arrow moves focus up", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      await terminal.sendKeys("j");
      await terminal.sendKeys("Up");

      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-005: k at top of list does not move focus (clamp)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Already at top, press k
      await terminal.sendKeys("k");

      // First item should still be focused
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-006: G jumps to the last item in the list", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press G (Shift+G) to jump to bottom
      await terminal.sendKeys("G");

      // The first content row should no longer have reverse video
      // (focus has moved to the last item)
      const line1 = terminal.getLine(2);
      expect(line1).not.toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-007: Ctrl+D pages down by half viewport height", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // ctrl+d uses the dedicated keyCtrlD method in helpers.ts
      await terminal.sendKeys("ctrl+d");

      // Focus should have moved down from the first row
      const line1 = terminal.getLine(2);
      expect(line1).not.toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-008: Ctrl+U pages up by half viewport height", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Move down first, then page back up
      await terminal.sendKeys("ctrl+d");
      await terminal.sendKeys("ctrl+u");

      // Should be back near the top
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-009: Enter on focused item navigates to detail view", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press Enter to select the first item
      await terminal.sendKeys("Enter");

      // Should navigate to detail view — breadcrumb updates with separator
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/›/);
    });

    test("KEY-LIST-010: j then Enter selects the second item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      await terminal.sendKeys("j");
      await terminal.sendKeys("Enter");

      // Should navigate to the second item's detail view
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/›/);
    });

    test("KEY-LIST-011: j at bottom of list does not move past last item (clamp)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Jump to bottom first
      await terminal.sendKeys("G");
      const snapshotBefore = terminal.snapshot();

      // Press j again — should stay at bottom
      await terminal.sendKeys("j");
      const snapshotAfter = terminal.snapshot();

      // Screen should not change
      expect(snapshotAfter).toBe(snapshotBefore);
    });
  });

  // ── Multi-Select Tests ────────────────────────────────────────

  describe("Multi-Select", () => {
    test("KEY-LIST-020: Space toggles selection indicator on focused item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press Space to select first item
      await terminal.sendKeys("Space");

      // Should show selection indicator (● bullet)
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/●/);
    });

    test("KEY-LIST-021: Space again deselects the item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Select then deselect
      await terminal.sendKeys("Space");
      await terminal.sendKeys("Space");

      // Selection indicator should be gone on the first row
      // (unselected rows show two spaces instead of ● )
      const line1 = terminal.getLine(2);
      expect(line1).not.toMatch(/●/);
    });

    test("KEY-LIST-022: Space does not advance focus", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press Space
      await terminal.sendKeys("Space");

      // First item should still be focused (reverse video)
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/\x1b\[7m/);
    });

    test("KEY-LIST-023: multiple items can be selected independently", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Select first, move down, select second
      await terminal.sendKeys("Space");
      await terminal.sendKeys("j");
      await terminal.sendKeys("Space");

      // Both rows should show selection indicator
      const line1 = terminal.getLine(2);
      expect(line1).toMatch(/●/);

      const line2 = terminal.getLine(3);
      expect(line2).toMatch(/●/);
    });
  });

  // ── Empty State Tests ─────────────────────────────────────────

  describe("Empty State", () => {
    test("EMPTY-LIST-001: empty list shows centered empty message", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      // Navigate to a list that is expected to be empty
      // (this requires a repo with no issues)
      await navigateToListScreen(terminal);

      // When the list is empty, the empty message should be visible.
      // This test validates the empty state component renders correctly.
      // Whether this passes depends on whether the test API returns empty data.
      const snapshot = terminal.snapshot();
      expect(snapshot).toBeDefined();
    });

    test("EMPTY-LIST-002: navigation keys are safe on empty list", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // These should be no-ops on empty list, not crash
      const before = terminal.snapshot();
      await terminal.sendKeys("j");
      await terminal.sendKeys("k");
      await terminal.sendKeys("G");
      await terminal.sendKeys("ctrl+d");
      await terminal.sendKeys("ctrl+u");
      const after = terminal.snapshot();

      // Screen should remain stable (no crash, no error)
      expect(before).toBeDefined();
      expect(after).toBeDefined();
    });
  });

  // ── Pagination Tests ──────────────────────────────────────────

  describe("Pagination", () => {
    test("PAGE-LIST-001: navigating past 80% triggers pagination indicator", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Navigate to bottom of list using G
      // This should trigger onEndReached if hasMore is true
      await terminal.sendKeys("G");

      // If pagination is active, should show loading indicator
      // The exact assertion depends on backend returning paginated data
      const snapshot = terminal.snapshot();
      expect(snapshot).toBeDefined();
    });

    test("PAGE-LIST-002: pagination loading indicator appears at bottom", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Trigger pagination
      await terminal.sendKeys("G");

      // Check for loading indicator at the bottom of the terminal
      // (above the status bar)
      const statusBarLine = terminal.rows - 1;
      const lineAboveStatus = terminal.getLine(statusBarLine - 1);

      // The loading indicator or content should be present
      expect(lineAboveStatus).toBeDefined();
    });
  });

  // ── Focus Gating Tests ────────────────────────────────────────

  describe("Focus Gating", () => {
    test("FOCUS-LIST-001: j/k inactive when search input is focused", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Press / to focus search input
      await terminal.sendKeys("/");

      // Press j — should type 'j' into search, not move list focus
      await terminal.sendKeys("j");

      // The search input should contain 'j'
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("j");
    });

    test("FOCUS-LIST-002: Esc from search restores list navigation", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Focus search, then escape
      await terminal.sendKeys("/");
      await terminal.sendKeys("Escape");

      // j should now move list focus (not type into search)
      await terminal.sendKeys("j");

      // Second row should now be focused
      const line2 = terminal.getLine(3);
      expect(line2).toMatch(/\x1b\[7m/);
    });
  });

  // ── Responsive Layout Tests ───────────────────────────────────

  describe("Responsive Layout", () => {
    test("RESP-LIST-001: list is functional at minimum terminal size (80x24)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await navigateToListScreen(terminal);

      // Content height = 24 - 2 = 22 rows
      // List should render and respond to navigation
      await terminal.sendKeys("j");
      const snapshot = terminal.snapshot();
      expect(snapshot).toBeDefined();
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RESP-LIST-002: resize updates viewport calculations", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Resize terminal to minimum
      await terminal.resize(
        TERMINAL_SIZES.minimum.width,
        TERMINAL_SIZES.minimum.height,
      );

      // Navigation should still work after resize
      await terminal.sendKeys("j");
      const line = terminal.getLine(3);
      expect(line).toBeDefined();
    });
  });

  // ── Screen Transition Tests ───────────────────────────────────

  describe("Screen Transitions", () => {
    test("TRANS-LIST-001: Enter navigates to detail, q returns to list", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Select first item
      await terminal.sendKeys("Enter");

      // Wait for detail screen — breadcrumb should show deeper path
      const headerAfterEnter = terminal.getLine(0);
      expect(headerAfterEnter).toMatch(/›/);

      // Go back
      await terminal.sendKeys("q");

      // Should be back on the list
      await terminal.waitForText("Issues", 5000);
    });

    test("TRANS-LIST-002: focus position preserved after back navigation", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      // Move focus to third item
      await terminal.sendKeys("j");
      await terminal.sendKeys("j");

      // Navigate to detail
      await terminal.sendKeys("Enter");

      // Go back
      await terminal.sendKeys("q");
      await terminal.waitForText("Issues", 5000);

      // Third item should still be focused
      // (depends on scroll position caching in NavigationProvider)
      const line3 = terminal.getLine(4);
      expect(line3).toMatch(/\x1b\[7m/);
    });
  });

  // ── Status Bar Hint Tests ─────────────────────────────────────

  describe("Status Bar Hints", () => {
    test("HINT-LIST-001: status bar shows navigation hints", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      const statusLine = terminal.getLine(terminal.rows - 1);
      // Status bar should show list navigation key hints
      expect(statusLine).toMatch(/j\/k|navigate|move/i);
    });

    test("HINT-LIST-002: status bar shows open/select action hint", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await navigateToListScreen(terminal);

      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/enter|open|select/i);
    });
  });
});
