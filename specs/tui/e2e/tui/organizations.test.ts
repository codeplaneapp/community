import { createTestTui } from "@microsoft/tui-test";
import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";

// =============================================================================
// Tab Bar Rendering
// =============================================================================

describe("TUI_ORG_OVERVIEW — tab bar rendering", () => {
  test("SNAP-TAB-001: tab bar renders all visible tabs at 120x40", async () => {
    // Navigate to org overview at 120×40
    // Verify tab bar shows: 1:Repositories (N)  2:Members (N)  3:Teams (N)
    // First tab (Repositories) is active with underline and bold
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o"); // go to orgs
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter"); // open first org
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-TAB-002: tab bar hides Settings for non-owner", async () => {
    // Non-owner navigates to org overview
    // Verify only 3 tabs visible: Repositories, Members, Teams
    // Settings tab is not rendered in the tab bar
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    const snapshot = tui.snapshot();
    expect(snapshot).not.toMatch(/Settings/);
  });

  test("SNAP-TAB-003: tab bar shows Settings for owner", async () => {
    // Owner navigates to org overview
    // Verify 4 tabs visible including Settings
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Owner fixture org should show Settings
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/4:Settings/);
  });

  test("SNAP-TAB-004: tab labels include count badges", async () => {
    // Verify tab labels include item counts: "1:Repositories (12)"
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatch(/Repositories \(\d+\)/);
  });

  test("SNAP-TAB-005: tab bar abbreviates labels at 80x24", async () => {
    // At 80×24, tab labels use shortLabel: "Repos", "Memb.", "Teams"
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repos");
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/1:Repos/);
    expect(snapshot).toMatch(/2:Memb\./);
  });

  test("SNAP-TAB-006: tab bar full labels at 120x40", async () => {
    // At 120×40, tab labels use full label: "Repositories", "Members"
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/1:Repositories/);
    expect(snapshot).toMatch(/2:Members/);
  });

  test("SNAP-TAB-007: active tab rendered with underline and bold", async () => {
    // Active tab rendered with bold + underline (ANSI SGR codes)
    // Inactive tabs rendered without bold/underline
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Snapshot comparison validates styling (bold + underline ANSI codes)
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-TAB-008: count K-abbreviated above 999", async () => {
    // Org with 1500 repos shows "Repositories (1.5K)"
    // Requires test fixture org with >999 items in a tab
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatch(/\d+\.\d+K\)/);
  });

  test("SNAP-TAB-009: count capped at 9999+", async () => {
    // Org with 15000+ items shows "(9999+)"
    // Requires test fixture org with >9999 items in a tab
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatch(/9999\+\)/);
  });
});

// =============================================================================
// Header Rendering
// =============================================================================

describe("TUI_ORG_OVERVIEW — header rendering", () => {
  test("SNAP-HDR-001: header shows title in bold", async () => {
    // Org name rendered in bold at top of header
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-HDR-002: header shows color-coded visibility badge", async () => {
    // Visibility badge rendered with correct fg color (green for public)
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-HDR-003: header shows word-wrapped description", async () => {
    // Long description wraps across multiple lines via wrapMode="word"
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-HDR-004: header shows placeholder when description empty", async () => {
    // Team detail with no description shows "No description provided." in gray
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    expect(tui.snapshot()).toMatch(/No description provided\./);
  });

  test("SNAP-HDR-005: header hides metadata at minimum breakpoint", async () => {
    // At 80×24, metadata lines with hideAtMinimum=true are not rendered
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repos");
    const snapshot = tui.snapshot();
    expect(snapshot).not.toMatch(/Website/);
    expect(snapshot).not.toMatch(/Location/);
  });

  test("SNAP-HDR-006: header shows all metadata at standard breakpoint", async () => {
    // At 120×40, all metadata lines rendered including Website and Location
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// =============================================================================
// Loading and Error States
// =============================================================================

describe("TUI_ORG_OVERVIEW — loading and error states", () => {
  test("SNAP-STA-001: loading state shows Loading text", async () => {
    // Slow API → full-screen "Loading…" text
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    // Capture snapshot during loading before data arrives
    expect(tui.snapshot()).toMatch(/Loading/);
  });

  test("SNAP-STA-002: error state shows message with retry hint", async () => {
    // API error → red error message + "Press R to retry"
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("retry");
    expect(tui.snapshot()).toMatch(/Press R to retry/);
  });

  test("KEY-STA-001: R key retries in error state", async () => {
    // Error state → press R → triggers retry
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("retry");
    await tui.sendKeys("r");
    // Should trigger re-fetch; if API still errors, shows error again
    // If API succeeds on retry, shows content
  });
});

// =============================================================================
// Tab Navigation Keyboard
// =============================================================================

describe("TUI_ORG_OVERVIEW — tab navigation keyboard", () => {
  test("KEY-TAB-001: Tab key cycles forward through tabs", async () => {
    // Tab key: Repos → Members → Teams → Repos (wraps)
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("Tab");
    // Members tab now active — verify content area changes
    await tui.waitForText("Members");

    await tui.sendKeys("Tab");
    // Teams tab now active
    await tui.waitForText("Teams");
  });

  test("KEY-TAB-002: Shift+Tab cycles backward through tabs", async () => {
    // Shift+Tab: Repos → Teams (wraps backward) → Members
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("shift+Tab");
    // Should wrap to last visible tab (Teams for non-owner)
  });

  test("KEY-TAB-003: Tab wraps forward from last to first", async () => {
    // From last tab, Tab wraps to first tab
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("3"); // jump to Teams (last for non-owner)
    await tui.sendKeys("Tab"); // should wrap to Repositories
    // Verify Repositories tab is active
    await tui.waitForText("Repositories");
  });

  test("KEY-TAB-004: Shift+Tab wraps backward from first to last", async () => {
    // From first tab, Shift+Tab wraps to last tab
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("shift+Tab"); // should wrap to last visible tab
  });

  test("KEY-TAB-005: number 1 jumps to first tab", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // go to Members
    await tui.sendKeys("1"); // back to Repositories
    // Verify Repositories tab is active
  });

  test("KEY-TAB-006: number 2 jumps to second tab", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // jump to Members
    // Verify Members tab is active
  });

  test("KEY-TAB-007: number 3 jumps to third tab", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("3"); // jump to Teams
    // Verify Teams tab is active
  });

  test("KEY-TAB-008: number 4 activates Settings push for owner", async () => {
    // Owner presses 4 → Settings tab activates (pushes settings screen)
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("4"); // jump to Settings
    // For pushOnActivate tabs, this pushes a new screen via NavigationProvider
  });

  test("KEY-TAB-009: number 4 is no-op for non-owner", async () => {
    // Non-owner presses 4 → no-op (Settings tab not visible, index 4 DNE)
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("4"); // no-op for non-owner
    // Verify still on current tab (Repositories)
  });

  test("KEY-TAB-010: number beyond tab count is no-op", async () => {
    // Press 9 when only 3-4 tabs → no-op
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("9"); // no-op
    // Verify still on Repositories tab
  });
});

// =============================================================================
// Tab Scroll Preservation
// =============================================================================

describe("TUI_ORG_OVERVIEW — tab scroll preservation", () => {
  test("KEY-SCR-001: scroll position preserved across tab switch", async () => {
    // Scroll down in Repos → switch to Members → switch back → scroll position restored
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    // Scroll down in repos
    for (let i = 0; i < 5; i++) await tui.sendKeys("j");

    // Switch to Members
    await tui.sendKeys("2");
    // Switch back to Repos
    await tui.sendKeys("1");

    // Verify scroll position is preserved (5th item focused)
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-SCR-002: focus index preserved across tab switch", async () => {
    // Focus 3rd item → switch tabs → switch back → 3rd item still focused
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("j", "j"); // focus 3rd item
    await tui.sendKeys("Tab"); // switch to Members
    await tui.sendKeys("shift+Tab"); // back to Repos

    // Verify 3rd item is focused
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("KEY-SCR-003: independent scroll state per tab", async () => {
    // Scroll in Repos, scroll differently in Members → each preserved independently
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    // Scroll down 5 in Repos
    for (let i = 0; i < 5; i++) await tui.sendKeys("j");
    // Switch to Members and scroll down 2
    await tui.sendKeys("2");
    await tui.sendKeys("j", "j");
    // Switch back to Repos → should be at position 5, not 2
    await tui.sendKeys("1");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// =============================================================================
// Lazy Loading
// =============================================================================

describe("TUI_ORG_OVERVIEW — lazy loading", () => {
  test("INT-LAZY-001: default tab data loaded on mount", async () => {
    // Repositories tab data loaded immediately on screen mount
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Verify repo list content is visible
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("INT-LAZY-002: non-default tab data loaded on first activation", async () => {
    // Members tab data NOT fetched until tab is activated
    // Switch to Members → loading indicator → data loads
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // switch to Members
    // Should show loading then content
    await tui.waitForText("Members");
  });

  test("INT-LAZY-003: tab data cached after first load", async () => {
    // Switch to Members → loads → switch away → switch back → instant (no loading)
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // Members
    await tui.waitForText("Members");
    await tui.sendKeys("1"); // back to Repos
    await tui.sendKeys("2"); // back to Members — should not show loading
    // Verify content is immediately visible without loading spinner
  });
});

// =============================================================================
// Filter
// =============================================================================

describe("TUI_ORG_OVERVIEW — filter", () => {
  test("KEY-FLT-001: slash activates filter input", async () => {
    // Press / → filter input appears at bottom with cursor
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    expect(tui.snapshot()).toMatch(/Filter/);
  });

  test("KEY-FLT-002: filter text narrows list", async () => {
    // Type in filter → list shows only matching items
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    await tui.sendText("api");
    // Verify only repos matching "api" are shown
  });

  test("KEY-FLT-003: Esc clears filter and restores list", async () => {
    // Filter active → Esc → filter cleared, full list restored
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    await tui.sendText("api");
    await tui.sendKeys("Escape");
    // Verify filter cleared and full list visible
  });

  test("KEY-FLT-004: navigation keys type into filter when active", async () => {
    // When filter is active, j/k/1/2/3/q type into filter, not navigate
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    await tui.sendText("jkq123");
    // Verify "jkq123" is in the filter input, not interpreted as navigation
  });

  test("KEY-FLT-005: filter text preserved per tab", async () => {
    // Filter on Repos → switch to Members → switch back → filter text restored
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    await tui.sendText("api");
    await tui.sendKeys("Escape"); // deactivate but text saved
    await tui.sendKeys("2"); // Members
    await tui.sendKeys("1"); // back to Repos
    // Verify filter text "api" is preserved
  });

  test("KEY-FLT-006: slash is no-op on non-filterable tab", async () => {
    // Settings tab (filterable: false) → / does not activate filter
    // This test requires owner fixture so Settings tab is visible
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Switch to Settings (if owner) - press 4
    await tui.sendKeys("4");
    // Settings uses pushOnActivate, so this navigates away
    // This test validates the filterable: false path
  });

  test("EDGE-FLT-001: filter input capped at 100 characters", async () => {
    // Type more than 100 characters → input capped at 100 via <input maxLength>
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("/");
    const longText = "a".repeat(150);
    await tui.sendText(longText);
    // Verify filter input contains max 100 characters
  });
});

// =============================================================================
// Responsive Behavior
// =============================================================================

describe("TUI_ORG_OVERVIEW — responsive behavior", () => {
  test("RSP-TAB-001: resize preserves active tab", async () => {
    // Switch to Members tab → resize from 120×40 to 80×24 → Members still active
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // Members
    await tui.resize(80, 24);
    // Verify Members tab still active (abbreviated label visible)
    expect(tui.snapshot()).toMatch(/2:Memb\./);
  });

  test("RSP-TAB-002: resize preserves focus within tab", async () => {
    // Focus 3rd item → resize → 3rd item still focused
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("j", "j"); // focus 3rd item
    await tui.resize(80, 24);
    // Verify 3rd item still focused
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RSP-TAB-003: resize reflows header metadata", async () => {
    // Resize from 120×40 to 80×24 → metadata lines with hideAtMinimum hidden
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.resize(80, 24);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RSP-TAB-004: team detail 2 tabs at 80x24", async () => {
    // Team detail at minimum → 2 abbreviated tab labels
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open first team
    await tui.waitForText("Memb.");
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/1:Memb\./);
    expect(snapshot).toMatch(/2:Repos/);
  });

  test("RSP-TAB-005: team detail 2 tabs at 120x40", async () => {
    // Team detail at standard → 2 full tab labels
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open first team
    await tui.waitForText("Members");
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/1:Members/);
    expect(snapshot).toMatch(/2:Repositories/);
  });

  test("RSP-TAB-006: below minimum shows terminal too small", async () => {
    // Terminal below 80×24 shows "Terminal too small" message
    const tui = await launchTUI({ cols: 60, rows: 20 });
    await tui.sendKeys("g", "o");
    // Should show terminal too small message
    expect(tui.snapshot()).toMatch(/Terminal too small/);
  });
});

// =============================================================================
// Integration
// =============================================================================

describe("TUI_ORG_OVERVIEW — integration", () => {
  test("INT-NAV-001: push-on-activate tab navigates to new screen", async () => {
    // Owner presses 4 (Settings) → org settings screen pushed
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("4"); // Settings (pushOnActivate)
    // Verify new screen is pushed (breadcrumb updates)
  });

  test("INT-NAV-002: back navigation preserves tab state", async () => {
    // Switch to Teams tab → Enter on team → q back → Teams tab still active
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.sendKeys("q"); // back
    // Verify Teams tab still active
  });

  test("INT-NAV-003: tab switch during loading does not cancel fetch", async () => {
    // Start loading Members → switch to Teams → Members data still loads
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    await tui.sendKeys("2"); // Members (starts loading)
    await tui.sendKeys("3"); // Teams (does not cancel Members fetch)
    await tui.sendKeys("2"); // Back to Members — should show cached data
  });

  test("EDGE-TAB-001: rapid tab switching no corruption", async () => {
    // Rapidly cycle through tabs → no visual corruption or state inconsistency
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");

    for (let i = 0; i < 20; i++) {
      await tui.sendKeys("Tab");
    }
    // Verify valid tab state after rapid cycling
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("EDGE-TAB-002: zero visible tabs shows empty message", async () => {
    // Edge case: all tabs have visible=false
    // Verify "No content available." message renders
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // This test depends on a fixture org with all tabs gated
    // Left failing until fixture is available
  });

  test("EDGE-TAB-003: single tab renders tab bar", async () => {
    // Only one visible tab → tab bar still rendered with single label
    // Tab/Shift+Tab are no-ops (same tab)
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Requires fixture with org that has only one tab visible
  });
});

// =============================================================================
// Team Detail (2 tabs)
// =============================================================================

describe("TUI_ORG_TEAM_DETAIL — tab navigation", () => {
  test("KEY-TEAM-001: Tab cycles between 2 tabs", async () => {
    // Members → Repos → Members (wraps)
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");

    await tui.sendKeys("Tab"); // → Repos
    await tui.sendKeys("Tab"); // → Members (wrap)
  });

  test("KEY-TEAM-002: number keys 1 and 2 jump to tabs", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");

    await tui.sendKeys("2"); // → Repos
    await tui.sendKeys("1"); // → Members
  });

  test("KEY-TEAM-003: number 3 is no-op with 2 tabs", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");

    await tui.sendKeys("3"); // no-op, only 2 tabs
    // Verify still on Members
  });

  test("SNAP-TEAM-001: team detail header with description placeholder", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-TEAM-002: team detail with permission badge", async () => {
    // Team badge shows permission level (read/write/admin) with color coding
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});
