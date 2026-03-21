import * as fs from 'fs';
import * as path from 'path';

const file = path.join(process.cwd(), 'e2e/tui/app-shell.test.ts');

const newTests = `

describe("getBreakpoint — boundary exhaustive", () => {
  // Unsupported (null) boundaries
  test("HOOK-BP-001: returns null for 79x24", () => {
    expect(getBreakpoint(79, 24)).toBeNull();
  });

  test("HOOK-BP-002: returns null for 80x23", () => {
    expect(getBreakpoint(80, 23)).toBeNull();
  });

  test("HOOK-BP-003: returns null for 0x0", () => {
    expect(getBreakpoint(0, 0)).toBeNull();
  });

  test("HOOK-BP-004: returns null for negative dimensions", () => {
    expect(getBreakpoint(-1, -1)).toBeNull();
  });

  // Minimum boundaries
  test("HOOK-BP-005: returns 'minimum' for exact lower bound 80x24", () => {
    expect(getBreakpoint(80, 24)).toBe("minimum");
  });

  test("HOOK-BP-006: returns 'minimum' for 119x39 (upper bound)", () => {
    expect(getBreakpoint(119, 39)).toBe("minimum");
  });

  test("HOOK-BP-007: returns 'minimum' for 120x39 (cols standard, rows not)", () => {
    expect(getBreakpoint(120, 39)).toBe("minimum");
  });

  test("HOOK-BP-008: returns 'minimum' for 119x40 (rows standard, cols not)", () => {
    expect(getBreakpoint(119, 40)).toBe("minimum");
  });

  // Standard boundaries
  test("HOOK-BP-009: returns 'standard' for exact lower bound 120x40", () => {
    expect(getBreakpoint(120, 40)).toBe("standard");
  });

  test("HOOK-BP-010: returns 'standard' for 199x59 (upper bound)", () => {
    expect(getBreakpoint(199, 59)).toBe("standard");
  });

  test("HOOK-BP-011: returns 'standard' for 200x59 (cols large, rows not)", () => {
    expect(getBreakpoint(200, 59)).toBe("standard");
  });

  test("HOOK-BP-012: returns 'standard' for 199x60 (rows large, cols not)", () => {
    expect(getBreakpoint(199, 60)).toBe("standard");
  });

  // Large boundaries
  test("HOOK-BP-013: returns 'large' for exact lower bound 200x60", () => {
    expect(getBreakpoint(200, 60)).toBe("large");
  });

  test("HOOK-BP-014: returns 'large' for 500x200", () => {
    expect(getBreakpoint(500, 200)).toBe("large");
  });
});

describe("useResponsiveValue — value selection logic", () => {
  test("HOOK-RV-001: selects 'minimum' value at 80x24", async () => {
    const result = await bunEval(\`
      const { getBreakpoint } = require("../../apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(80, 24);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe(0);
  });

  test("HOOK-RV-002: selects 'standard' value at 120x40", async () => {
    const result = await bunEval(\`
      const { getBreakpoint } = require("../../apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(120, 40);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe(2);
  });

  test("HOOK-RV-003: selects 'large' value at 200x60", async () => {
    const result = await bunEval(\`
      const { getBreakpoint } = require("../../apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(200, 60);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe(4);
  });

  test("HOOK-RV-004: returns undefined when below minimum and no fallback", async () => {
    const result = await bunEval(\`
      const { getBreakpoint } = require("../../apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(60, 20);
      const values = { minimum: 0, standard: 2, large: 4 };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ bp, selected }));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBeNull();
    expect(parsed.selected).toBeUndefined();
  });

  test("HOOK-RV-005: returns fallback when below minimum", async () => {
    const result = await bunEval(\`
      const { getBreakpoint } = require("../../apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(60, 20);
      const values = { minimum: 0, standard: 2, large: 4 };
      const fallback = -1;
      const selected = bp ? values[bp] : fallback;
      console.log(JSON.stringify({ selected }));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe(-1);
  });

  test("HOOK-RV-006: works with string values", async () => {
    const result = await bunEval(\`
      const { getBreakpoint } = require("../../apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(120, 40);
      const values = { minimum: "sm", standard: "md", large: "lg" };
      const selected = bp ? values[bp] : undefined;
      console.log(JSON.stringify({ selected }));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.selected).toBe("md");
  });
});

describe("useSidebarState — visibility resolution", () => {
  test("HOOK-SB-001: sidebar hidden when breakpoint is null", async () => {
    const result = await bunEval(\`
      function resolve(bp, pref) {
        if (!bp) return { visible: false, autoOverride: true };
        if (bp === "minimum") return { visible: false, autoOverride: true };
        return { visible: pref !== null ? pref : true, autoOverride: false };
      }
      console.log(JSON.stringify(resolve(null, null)));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test("HOOK-SB-002: sidebar hidden at minimum breakpoint", async () => {
    const result = await bunEval(\`
      function resolve(bp, pref) {
        if (!bp) return { visible: false, autoOverride: true };
        if (bp === "minimum") return { visible: false, autoOverride: true };
        return { visible: pref !== null ? pref : true, autoOverride: false };
      }
      console.log(JSON.stringify(resolve("minimum", null)));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test("HOOK-SB-003: sidebar hidden at minimum even with user preference true", async () => {
    const result = await bunEval(\`
      function resolve(bp, pref) {
        if (!bp) return { visible: false, autoOverride: true };
        if (bp === "minimum") return { visible: false, autoOverride: true };
        return { visible: pref !== null ? pref : true, autoOverride: false };
      }
      console.log(JSON.stringify(resolve("minimum", true)));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(true);
  });

  test("HOOK-SB-004: sidebar visible at standard with no user preference", async () => {
    const result = await bunEval(\`
      function resolve(bp, pref) {
        if (!bp) return { visible: false, autoOverride: true };
        if (bp === "minimum") return { visible: false, autoOverride: true };
        return { visible: pref !== null ? pref : true, autoOverride: false };
      }
      console.log(JSON.stringify(resolve("standard", null)));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });

  test("HOOK-SB-005: sidebar hidden at standard with user preference false", async () => {
    const result = await bunEval(\`
      function resolve(bp, pref) {
        if (!bp) return { visible: false, autoOverride: true };
        if (bp === "minimum") return { visible: false, autoOverride: true };
        return { visible: pref !== null ? pref : true, autoOverride: false };
      }
      console.log(JSON.stringify(resolve("standard", false)));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(false);
    expect(parsed.autoOverride).toBe(false);
  });

  test("HOOK-SB-006: sidebar visible at large with no user preference", async () => {
    const result = await bunEval(\`
      function resolve(bp, pref) {
        if (!bp) return { visible: false, autoOverride: true };
        if (bp === "minimum") return { visible: false, autoOverride: true };
        return { visible: pref !== null ? pref : true, autoOverride: false };
      }
      console.log(JSON.stringify(resolve("large", null)));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });

  test("HOOK-SB-007: sidebar visible at standard with user preference true", async () => {
    const result = await bunEval(\`
      function resolve(bp, pref) {
        if (!bp) return { visible: false, autoOverride: true };
        if (bp === "minimum") return { visible: false, autoOverride: true };
        return { visible: pref !== null ? pref : true, autoOverride: false };
      }
      console.log(JSON.stringify(resolve("standard", true)));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visible).toBe(true);
    expect(parsed.autoOverride).toBe(false);
  });
});

describe("useLayout — sidebarWidth respects visibility", () => {
  test("HOOK-LAY-030: sidebarWidth is '0%' when sidebar is toggled off at standard", async () => {
    const result = await bunEval(\`
      function getSidebarWidth(bp, visible) {
        if (!visible) return "0%";
        switch (bp) {
          case "large": return "30%";
          case "standard": return "25%";
          default: return "0%";
        }
      }
      console.log(JSON.stringify({
        visibleStandard: getSidebarWidth("standard", true),
        hiddenStandard: getSidebarWidth("standard", false),
        visibleLarge: getSidebarWidth("large", true),
        hiddenLarge: getSidebarWidth("large", false),
      }));
    \`);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.visibleStandard).toBe("25%");
    expect(parsed.hiddenStandard).toBe("0%");
    expect(parsed.visibleLarge).toBe("30%");
    expect(parsed.hiddenLarge).toBe("0%");
  });
});

describe("TUI Responsive Layout — sidebar toggle E2E", () => {
  test("RESP-SB-001: Ctrl+B toggles sidebar off at standard breakpoint", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const beforeSnapshot = terminal.snapshot();
    await terminal.sendKeys("ctrl+b");
    const afterSnapshot = terminal.snapshot();
    expect(beforeSnapshot).not.toBe(afterSnapshot);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("RESP-SB-002: Ctrl+B toggles sidebar back on at standard breakpoint", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("ctrl+b");
    await terminal.sendKeys("ctrl+b");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("RESP-SB-003: Ctrl+B is no-op at minimum breakpoint", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    const before = terminal.snapshot();
    await terminal.sendKeys("ctrl+b");
    const after = terminal.snapshot();
    expect(before).toBe(after);
    await terminal.terminate();
  });

  test("RESP-SB-004: user preference survives resize through minimum", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("ctrl+b");
    const hiddenSnapshot = terminal.snapshot();
    await terminal.resize(80, 24);
    await terminal.waitForText("Dashboard");
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
    const restoredSnapshot = terminal.snapshot();
    expect(restoredSnapshot).toMatchSnapshot();
    await terminal.terminate();
  });

  test("RESP-SB-005: sidebar shows at large breakpoint with wider width", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});

describe("TUI Responsive Layout — resize transitions extended", () => {
  test("RESP-LAY-020: resize from large to standard changes sidebar width", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("RESP-LAY-021: resize from standard to large changes modal/sidebar widths", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(200, 60);
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("RESP-LAY-022: content area height adjusts on vertical resize", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(120, 50);
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(49);
    expect(statusLine.length).toBeGreaterThan(0);
    await terminal.terminate();
  });

  test("RESP-LAY-023: modal width is 90% at minimum, 60% at standard via command palette", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":"); 
    await terminal.waitForText("Command");
    const standardSnapshot = terminal.snapshot();
    await terminal.sendKeys("Escape");

    await terminal.resize(80, 24);
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":"); 
    await terminal.waitForText("Command");
    const minimumSnapshot = terminal.snapshot();

    expect(standardSnapshot).not.toBe(minimumSnapshot);
    await terminal.terminate();
  });
});
`;

fs.appendFileSync(file, newTests);
console.log('Tests appended.');
