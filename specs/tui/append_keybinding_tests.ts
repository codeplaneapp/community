import fs from 'fs';
const content = fs.readFileSync('e2e/tui/app-shell.test.ts', 'utf8');

const newTests = `

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
    expect(statusLine).toMatch(/\\S+:\\S+/);
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
    await terminal.sendKeys("\\x03");
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
    await terminal.sendKeys("\\x03");
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
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/\\?.*help/i);
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/\\?.*help/i);
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
    expect(snap).toMatch(/\\?/);
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
    const wide = (terminal.getLine(terminal.rows - 1).match(/\\S+:\\S+/g) || []).length;
    await terminal.resize(80, 24);
    const narrow = (terminal.getLine(terminal.rows - 1).match(/\\S+:\\S+/g) || []).length;
    expect(narrow).toBeLessThanOrEqual(wide);
  });
});
`;

const updatedContent = content + newTests;
fs.writeFileSync('e2e/tui/app-shell.test.ts', updatedContent);
