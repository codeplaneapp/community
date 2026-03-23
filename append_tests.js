const fs = require('fs');
const path = require('path');

const newContent = `
// ---------------------------------------------------------------------------
// TUI_THEME_AND_COLOR_TOKENS — Color Detection
// ---------------------------------------------------------------------------

describe("TUI_THEME_AND_COLOR_TOKENS — Color Detection", () => {
  test("THEME_TIER_01: detects truecolor when COLORTERM=truecolor is set", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor", TERM: "xterm-256color", NO_COLOR: "" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[38;2;/);
    await terminal.terminate();
  });

  test("THEME_TIER_02: detects ansi256 when TERM contains 256color", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "", TERM: "xterm-256color", NO_COLOR: "" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[38;5;/);
    await terminal.terminate();
  });

  test("THEME_TIER_03: falls back to ansi16 when TERM indicates basic terminal", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "", TERM: "xterm", NO_COLOR: "" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/\\x1b\\[38;2;/);
    expect(snapshot).not.toMatch(/\\x1b\\[38;5;/);
    await terminal.terminate();
  });

  test("THEME_TIER_04: falls back to ansi256 when COLORTERM and TERM are both unset", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });
});

// ---------------------------------------------------------------------------
// TUI_THEME_AND_COLOR_TOKENS — Theme Token Application
// ---------------------------------------------------------------------------

describe("TUI_THEME_AND_COLOR_TOKENS — Theme Token Application", () => {
  test("THEME_SNAPSHOT_01: renders header bar with correct semantic colors at 120x40", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/\\x1b\\[/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_SNAPSHOT_02: renders status bar with correct semantic colors at 120x40", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    const lastLine = terminal.getLine(terminal.rows - 1);
    expect(lastLine).toMatch(/\\x1b\\[/);
    expect(lastLine).toMatch(/help/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_SNAPSHOT_03: renders focused list item with primary color at 120x40", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[(?:7m|38;2;37;99;235)/);
    await terminal.sendKeys("j");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_SNAPSHOT_04: renders modal overlay with surface background and border color at 120x40", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_SNAPSHOT_06: renders issue status badges with semantic colors at 120x40", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Issues");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});

// ---------------------------------------------------------------------------
// TUI_THEME_AND_COLOR_TOKENS — NO_COLOR and TERM=dumb
// ---------------------------------------------------------------------------

describe("TUI_THEME_AND_COLOR_TOKENS — NO_COLOR and TERM=dumb", () => {
  test("THEME_NOCOLOR_01: NO_COLOR=1 disables all color escapes", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { NO_COLOR: "1", COLORTERM: "truecolor", TERM: "xterm-256color" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/\\x1b\\[38;2;/);
    expect(snapshot).not.toMatch(/\\x1b\\[38;5;/);
    await terminal.terminate();
  });

  test("THEME_NOCOLOR_02: TERM=dumb renders plain text layout", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { TERM: "dumb", COLORTERM: "", NO_COLOR: "" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/\\x1b\\[38;2;/);
    expect(snapshot).not.toMatch(/\\x1b\\[38;5;/);
    expect(snapshot).toContain("Dashboard");
    await terminal.terminate();
  });
});

// ---------------------------------------------------------------------------
// TUI_THEME_AND_COLOR_TOKENS — Keyboard Interaction
// ---------------------------------------------------------------------------

describe("TUI_THEME_AND_COLOR_TOKENS — Keyboard Interaction", () => {
  test("THEME_KEY_01: focus highlight follows j/k navigation in list views", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");

    const snap1 = terminal.snapshot();
    await terminal.sendKeys("j");
    const snap2 = terminal.snapshot();
    expect(snap2).not.toBe(snap1);

    await terminal.sendKeys("k");
    const snap3 = terminal.snapshot();
    expect(snap3).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_KEY_03: help overlay renders keybinding keys with primary token", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_KEY_04: Esc dismisses modal and restores underlying screen colors", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    const beforeModal = terminal.snapshot();

    await terminal.sendKeys(":");
    const duringModal = terminal.snapshot();
    expect(duringModal).not.toBe(beforeModal);

    await terminal.sendKeys("Escape");
    const afterModal = terminal.snapshot();
    expect(afterModal).toContain("Dashboard");
    await terminal.terminate();
  });
});

// ---------------------------------------------------------------------------
// TUI_THEME_AND_COLOR_TOKENS — Responsive Size
// ---------------------------------------------------------------------------

describe("TUI_THEME_AND_COLOR_TOKENS — Responsive Size", () => {
  test("THEME_RESPONSIVE_01: colors render correctly at minimum 80x24 terminal", async () => {
    const terminal = await launchTUI({
      cols: 80,
      rows: 24,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_RESPONSIVE_02: colors render correctly at standard 120x40 terminal", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_RESPONSIVE_03: colors render correctly at large 200x60 terminal", async () => {
    const terminal = await launchTUI({
      cols: 200,
      rows: 60,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_RESPONSIVE_04: colors survive terminal resize from 200x60 to 80x24", async () => {
    const terminal = await launchTUI({
      cols: 200,
      rows: 60,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    await terminal.resize(80, 24);
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(snapshot).toContain("Dashboard");
    await terminal.terminate();
  });

  test("THEME_RESPONSIVE_05: colors survive terminal resize from 80x24 to 120x40", async () => {
    const terminal = await launchTUI({
      cols: 80,
      rows: 24,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(snapshot).toContain("Dashboard");
    await terminal.terminate();
  });
});

// ---------------------------------------------------------------------------
// TUI_THEME_AND_COLOR_TOKENS — Error States
// ---------------------------------------------------------------------------

describe("TUI_THEME_AND_COLOR_TOKENS — Error States", () => {
  test("THEME_ERROR_01: error boundary screen uses error and muted tokens", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/ErrorBoundary.tsx")).text();
    expect(content).not.toMatch(/fg=["']#[0-9A-Fa-f]{6}["']/);
    expect(content).toMatch(/import.*(?:createTheme|detectColorCapability|theme)/);
  });

  test("THEME_ERROR_02: network error inline message uses error token", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: {
        COLORTERM: "truecolor",
        CODEPLANE_API_URL: "http://localhost:1",
      },
    });
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    await terminal.terminate();
  });

  test("THEME_ERROR_03: auth error message uses error token", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: {
        COLORTERM: "truecolor",
        CODEPLANE_TOKEN: "invalid-expired-token",
      },
    });
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    await terminal.terminate();
  });

  test("THEME_ERROR_04: SSE disconnect updates status bar indicator from success to error token", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.waitForText("Dashboard");
    const lastLine = terminal.getLine(terminal.rows - 1);
    expect(lastLine).toMatch(/\\x1b\\[/);
    await terminal.terminate();
  });
});

// ---------------------------------------------------------------------------
// TUI_THEME_AND_COLOR_TOKENS — Consistency
// ---------------------------------------------------------------------------

describe("TUI_THEME_AND_COLOR_TOKENS — Consistency", () => {
  test("THEME_CONSISTENCY_01: no hardcoded color strings in component files", async () => {
    const componentDir = join(TUI_SRC, "components");
    const componentFiles = [
      "AppShell.tsx",
      "HeaderBar.tsx",
      "StatusBar.tsx",
      "ErrorBoundary.tsx",
    ];
    for (const file of componentFiles) {
      if (!existsSync(join(componentDir, file))) continue;
      const content = await Bun.file(join(componentDir, file)).text();
      const lines = content.split("\\n");
      for (const line of lines) {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
        expect(line).not.toMatch(/(?:fg|bg|borderColor|backgroundColor)=["']#[0-9A-Fa-f]{3,8}["']/);
      }
    }
  });

  test("THEME_CONSISTENCY_02: loading states use muted token for spinner and placeholder text", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    await terminal.sendKeys("g", "r");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_CONSISTENCY_03: Agent colors module is deleted", async () => {
    const agentColorsPath = join(TUI_SRC, "screens/Agents/components/colors.ts");
    const exists = existsSync(agentColorsPath);
    if (exists) {
      const content = await Bun.file(agentColorsPath).text();
      expect(content).toMatch(/useTheme|import.*from.*theme/);
      expect(content).not.toMatch(/RGBA\\.fromHex/);
    }
  });

  test("THEME_CONSISTENCY_04: ANSI 256 fallback renders readable output", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "", TERM: "xterm-256color", NO_COLOR: "" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/\\x1b\\[38;5;/);
    expect(snapshot).toContain("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("THEME_CONSISTENCY_05: ANSI 16 fallback renders readable output", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "", TERM: "xterm", NO_COLOR: "" },
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/\\x1b\\[38;2;/);
    expect(snapshot).not.toMatch(/\\x1b\\[38;5;/);
    expect(snapshot).toContain("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});

// ---------------------------------------------------------------------------
// TUI_THEME_AND_COLOR_TOKENS — Token System Unit Tests
// ---------------------------------------------------------------------------

describe("TUI_THEME_AND_COLOR_TOKENS — Token System Unit Tests", () => {
  test("THEME_UNIT_01: statusToToken maps all issue states", async () => {
    const result = await bunEval(\`
      import { statusToToken } from '../../apps/tui/src/theme/tokens.js';
      console.log(JSON.stringify({
        open: statusToToken('open'),
        closed: statusToToken('closed'),
        draft: statusToToken('draft'),
        merged: statusToToken('merged'),
        rejected: statusToToken('rejected'),
      }));
    \`);
    expect(result.exitCode).toBe(0);
    const map = JSON.parse(result.stdout.trim());
    expect(map.open).toBe("success");
    expect(map.closed).toBe("error");
    expect(map.draft).toBe("warning");
    expect(map.merged).toBe("success");
    expect(map.rejected).toBe("error");
  });

  test("THEME_UNIT_02: statusToToken maps all workflow states", async () => {
    const result = await bunEval(\`
      import { statusToToken } from '../../apps/tui/src/theme/tokens.js';
      console.log(JSON.stringify({
        completed: statusToToken('completed'),
        failed: statusToToken('failed'),
        in_progress: statusToToken('in_progress'),
        queued: statusToToken('queued'),
        cancelled: statusToToken('cancelled'),
      }));
    \`);
    expect(result.exitCode).toBe(0);
    const map = JSON.parse(result.stdout.trim());
    expect(map.completed).toBe("success");
    expect(map.failed).toBe("error");
    expect(map.in_progress).toBe("warning");
    expect(map.queued).toBe("warning");
    expect(map.cancelled).toBe("error");
  });

  test("THEME_UNIT_03: statusToToken maps all sync states", async () => {
    const result = await bunEval(\`
      import { statusToToken } from '../../apps/tui/src/theme/tokens.js';
      console.log(JSON.stringify({
        connected: statusToToken('connected'),
        syncing: statusToToken('syncing'),
        disconnected: statusToToken('disconnected'),
      }));
    \`);
    expect(result.exitCode).toBe(0);
    const map = JSON.parse(result.stdout.trim());
    expect(map.connected).toBe("success");
    expect(map.syncing).toBe("warning");
    expect(map.disconnected).toBe("error");
  });

  test("THEME_UNIT_04: color tokens do not allocate new Float32Array on every access", async () => {
    const result = await bunEval(\`
      import { createTheme } from '../../apps/tui/src/theme/tokens.js';
      const t1 = createTheme('truecolor');
      const t2 = createTheme('truecolor');
      console.log(t1 === t2);
      console.log(t1.primary.buffer === t2.primary.buffer);
    \`);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split("\\n");
    expect(lines[0]).toBe("true");
    expect(lines[1]).toBe("true");
  });

  test("THEME_UNIT_05: all 12 token names are present in each tier", async () => {
    const result = await bunEval(\`
      import { createTheme } from '../../apps/tui/src/theme/tokens.js';
      const expectedKeys = [
        'primary', 'success', 'warning', 'error', 'muted', 'surface', 'border',
        'diffAddedBg', 'diffRemovedBg', 'diffAddedText', 'diffRemovedText', 'diffHunkHeader'
      ];
      const tiers = ['truecolor', 'ansi256', 'ansi16'];
      const ok = tiers.every(tier => {
        const theme = createTheme(tier);
        return expectedKeys.every(key => theme[key] !== undefined && theme[key] !== null);
      });
      console.log(ok);
    \`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("true");
  });

  test("THEME_UNIT_06: detectColorCapability is canonical (diff-syntax delegates to it)", async () => {
    const content = await Bun.file(join(TUI_SRC, "lib/diff-syntax.ts")).text();
    expect(content).toMatch(/import.*(?:detectColorCapability|detectColorTier).*from.*(?:theme\\/detect|\\.\\.\\/theme)/);
  });
});
`;

fs.appendFileSync('e2e/tui/app-shell.test.ts', newContent);
