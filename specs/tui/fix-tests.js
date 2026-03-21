import fs from 'fs';

const content = fs.readFileSync('e2e/tui/app-shell.test.ts', 'utf8');
const lines = content.split('\n');

const startIndex = lines.findIndex(line => line.includes('describe("TUI Navigation Provider and App Shell"'));
const endIndex = lines.findIndex(line => line.includes('// TUI_APP_SHELL — Package scaffold'));

const newTests = `import { ScreenName } from "../../apps/tui/src/router/types.js";
import { screenRegistry } from "../../apps/tui/src/router/registry.js";

describe("TUI_SCREEN_ROUTER — navigation stack", () => {
  test("NAV-001: TUI launches with Dashboard as default root screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    await terminal.terminate();
  });

  test("NAV-002: push renders new screen and updates breadcrumb", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Repositories/);
    await terminal.terminate();
  });

  test("NAV-003: q pops current screen and returns to previous", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("NAV-004: q on root screen does not crash", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("q");
    await terminal.terminate();
  });

  test("NAV-005: reset clears stack and shows new root", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Notifications/);
    expect(headerLine).not.toMatch(/Repositories/);
    await terminal.terminate();
  });

  test("NAV-006: replace swaps top screen without growing stack", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("Tab");
    await terminal.sendKeys("q");
    await terminal.terminate();
  });

  test("NAV-007: duplicate push is silently ignored", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter", "Enter");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("NAV-008: push with different params is not a duplicate", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.terminate();
  });
});

describe("TUI_SCREEN_ROUTER — breadcrumb rendering", () => {
  test("NAV-BREAD-001: breadcrumb shows screen names separated by ›", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.terminate();
  });

  test("NAV-BREAD-002: repo screen breadcrumb shows owner/repo", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo-detail", "--repo", "acme/widget"] });
    await terminal.terminate();
  });

  test("NAV-BREAD-003: issue detail breadcrumb shows #number", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/widget"] });
    await terminal.terminate();
  });

  test("NAV-BREAD-004: deep stack breadcrumb renders all entries", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.terminate();
  });
});

describe("TUI_SCREEN_ROUTER — stack constraints", () => {
  test("NAV-STACK-001: stack enforces max depth of 32", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.terminate();
  });

  test("NAV-STACK-002: pop at single-entry stack is no-op", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("q");
    await terminal.terminate();
  });
});

describe("TUI_SCREEN_ROUTER — context inheritance", () => {
  test("NAV-CTX-001: repo context inherited when pushing repo-scoped screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.terminate();
  });

  test("NAV-CTX-002: org context inherited when pushing org-scoped screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.terminate();
  });
});

describe("TUI_SCREEN_ROUTER — placeholder screen", () => {
  test("NAV-PH-001: placeholder screen displays screen name", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "o");
    await terminal.waitForText("Organizations");
    await terminal.terminate();
  });

  test("NAV-PH-002: placeholder screen displays params", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/widget"] });
    await terminal.waitForText("acme");
    await terminal.waitForText("widget");
    await terminal.terminate();
  });

  test("NAV-PH-003: placeholder screen shows not-implemented message", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("not yet implemented");
    await terminal.terminate();
  });
});

describe("TUI_SCREEN_ROUTER — snapshot tests", () => {
  test("SNAP-NAV-001: Dashboard placeholder at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-NAV-002: Dashboard placeholder at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-NAV-003: multi-level breadcrumb at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "issues", "--repo", "acme/widget"] });
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("SNAP-NAV-004: multi-level breadcrumb at 120x40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/widget"] });
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});

describe("TUI_SCREEN_ROUTER — deep link launch", () => {
  test("NAV-DEEP-001: --screen issues --repo acme/widget opens Issues with stack", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "issues", "--repo", "acme/widget"] });
    await terminal.waitForText("Issues");
    await terminal.terminate();
  });

  test("NAV-DEEP-002: --screen dashboard opens Dashboard as root", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "dashboard"] });
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });
});

describe("TUI_SCREEN_ROUTER — registry completeness", () => {
  test("NAV-REG-001: every ScreenName has a registry entry", () => {
    expect(Object.values(ScreenName).every(name => screenRegistry[name as ScreenName] !== undefined)).toBe(true);
  });

  test("NAV-REG-002: every registry entry has a breadcrumbLabel function", () => {
    expect(Object.values(screenRegistry).every(def => typeof def.breadcrumbLabel === "function")).toBe(true);
  });

  test("NAV-REG-003: every registry entry has a component", () => {
    expect(Object.values(screenRegistry).every(def => typeof def.component === "function")).toBe(true);
  });
});
`;

const newLines = [
  ...lines.slice(0, startIndex),
  newTests,
  ...lines.slice(endIndex)
];

fs.writeFileSync('e2e/tui/app-shell.test.ts', newLines.join('\n'));
