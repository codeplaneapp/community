import { test, expect, describe } from "bun:test";
import { launchTUI } from "./helpers";

describe("TUI_AGENTS — agent screen registry", () => {
  describe("go-to navigation", () => {
    test("NAV-AGT-001: g a navigates to agent sessions when repo context is active", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys("g", "a");
      await terminal.waitForText("Agent Sessions");

      // Breadcrumb shows full path
      expect(terminal.getLine(0)).toMatch(/Dashboard.*›.*acme\/api.*›.*Agent Sessions/);

      await terminal.terminate();
    });

    test("NAV-AGT-002: g a without repo context shows error and does not change screen", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });

      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("g", "a");

      // Should stay on Dashboard
      await terminal.waitForText("Dashboard");
      await terminal.waitForNoText("Agent Sessions");

      // Status bar shows context error
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/No repository in context/);

      await terminal.terminate();
    });

    test("NAV-AGT-003: g shows go-to mode indicator in status bar with agent hint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys("g");

      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/g\+a:agents/i);

      await terminal.terminate();
    });

    test("NAV-AGT-004: Esc cancels go-to mode without navigating or popping", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("g");
      await terminal.sendKeys("Escape");

      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).not.toMatch(/g\+a:agents/i);

      expect(terminal.getLine(0)).not.toMatch(/Agent Sessions/);

      await terminal.terminate();
    });

    test("NAV-AGT-005: g a builds correct navigation stack with back navigation", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys("g", "a");
      await terminal.waitForText("Agent Sessions");

      // q → repo overview
      await terminal.sendKeys("q");
      await terminal.waitForText("acme/api");
      await terminal.waitForNoText("Agent Sessions");
      expect(terminal.getLine(0)).toMatch(/Dashboard.*›.*acme\/api/);

      // q → dashboard
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");
      expect(terminal.getLine(0)).not.toMatch(/acme\/api/);

      await terminal.terminate();
    });

    test("NAV-AGT-006: unrecognized key during go-to mode cancels silently", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("g");
      await terminal.sendKeys("x"); // unrecognized

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).not.toMatch(/g\+a:agents/i);

      await terminal.terminate();
    });
  });

  describe("command palette", () => {
    test("CMD-AGT-001: ':agents' alias navigates to agent sessions", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");

      await terminal.sendText(":agents");
      await terminal.waitForText("Agent Sessions");

      await terminal.sendKeys("Enter");
      await terminal.waitForText("Agent Sessions");

      expect(terminal.getLine(0)).toMatch(/Agent Sessions/);

      await terminal.terminate();
    });

    test("CMD-AGT-002: 'Agent Sessions' fuzzy matches partial query 'ag se'", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("ag se");
      await terminal.waitForText("Agent Sessions");

      await terminal.terminate();
    });

    test("CMD-AGT-003: 'New Agent Session' command visible with repo context and write access", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("New Agent");
      await terminal.waitForText("New Agent Session");

      await terminal.terminate();
    });

    test("CMD-AGT-004: 'New Agent Session' command hidden without repo context", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("New Agent");

      await terminal.waitForNoText("New Agent Session");

      await terminal.terminate();
    });

    test("CMD-AGT-005: 'Agent Sessions' command hidden without repo context", async () => {
      const terminal = await launchTUI({ cols: 120, rows: 40 });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText(":agents");

      await terminal.waitForNoText("Agent Sessions");

      await terminal.terminate();
    });

    test("CMD-AGT-006: keybinding hint 'g a' shown next to Agent Sessions in palette", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("Agent Sessions");
      await terminal.waitForText("Agent Sessions");

      await terminal.waitForText("g a");

      await terminal.terminate();
    });
  });

  describe("deep-links", () => {
    test("DLK-AGT-001: --screen agents --repo opens agent session list with correct stack", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.getLine(0)).toMatch(/Dashboard.*›.*acme\/api.*›.*Agent Sessions/);

      await terminal.terminate();
    });

    test("DLK-AGT-002: --screen agent-chat --repo --session-id opens chat screen with session in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "sess-abc123"],
      });

      await terminal.waitForText("Session");
      expect(terminal.getLine(0)).toMatch(
        /Dashboard.*›.*acme\/api.*›.*Agent Sessions.*›.*Session/,
      );

      await terminal.terminate();
    });

    test("DLK-AGT-003: --screen agent-replay --repo --session-id opens replay screen with replay in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "sess-abc123"],
      });

      await terminal.waitForText("Replay");
      expect(terminal.getLine(0)).toMatch(
        /Dashboard.*›.*acme\/api.*›.*Agent Sessions.*›.*Replay/,
      );

      await terminal.terminate();
    });

    test("DLK-AGT-004: --screen agents without --repo shows error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents"],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/--repo required/);

      await terminal.terminate();
    });

    test("DLK-AGT-005: --screen agent-chat without --session-id shows error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/--session-id required/);

      await terminal.terminate();
    });

    test("DLK-AGT-006: --screen agent-replay without --session-id shows error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/--session-id required/);

      await terminal.terminate();
    });

    test("DLK-AGT-007: --session-id with whitespace shows format error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "bad id"],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Invalid session ID format/);

      await terminal.terminate();
    });

    test("DLK-AGT-008: --screen value is case-insensitive", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "AGENTS", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.getLine(0)).toMatch(/Agent Sessions/);

      await terminal.terminate();
    });

    test("DLK-AGT-009: --repo with invalid format shows error and falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents", "--repo", "invalid-format"],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Invalid repository format/);

      await terminal.terminate();
    });

    test("DLK-AGT-010: deep-linked agent chat supports full back navigation through pre-built stack", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "sess-abc123"],
      });

      await terminal.waitForText("Session");

      // q → Agents list
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions");
      await terminal.waitForNoText("Session: sess-ab");

      // q → Repo overview
      await terminal.sendKeys("q");
      await terminal.waitForText("acme/api");
      await terminal.waitForNoText("Agent Sessions");

      // q → Dashboard
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");

      await terminal.terminate();
    });

    test("DLK-AGT-011: deep-linked agent replay supports full back navigation through pre-built stack", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "sess-xyz789"],
      });

      await terminal.waitForText("Replay");

      // q → Agents list
      await terminal.sendKeys("q");
      await terminal.waitForText("Agent Sessions");

      // q → Repo overview
      await terminal.sendKeys("q");
      await terminal.waitForText("acme/api");

      // q → Dashboard
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");

      await terminal.terminate();
    });

    test("DLK-AGT-012: --session-id with empty string shows format error", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", ""],
      });

      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(terminal.rows - 1);
      expect(statusLine).toMatch(/Invalid session ID format/);

      await terminal.terminate();
    });
  });

  describe("screen registry", () => {
    test("REG-AGT-001: Agents screen registered — reachable by deep-link with requiresRepo satisfied", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      await terminal.terminate();
    });

    test("REG-AGT-002: AgentChat screen registered — requires sessionId param", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });

    test("REG-AGT-003: AgentSessionReplay screen registered — requires sessionId param", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });

    test("REG-AGT-004: agent-create is not a deep-link target — falls back to dashboard", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-create", "--repo", "acme/api"],
      });

      await terminal.waitForText("Dashboard");
      await terminal.terminate();
    });

    test("REG-AGT-005: AgentSessionCreate reachable only via command palette", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("New Agent Session");
      await terminal.waitForText("New Agent Session");
      await terminal.sendKeys("Enter");

      await terminal.waitForText("New Agent Session");
      expect(terminal.getLine(0)).toMatch(/New Session/);

      await terminal.terminate();
    });
  });

  describe("snapshots", () => {
    test("SNAP-AGT-001: agent session list stub renders at 120x40", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("SNAP-AGT-002: agent session list stub renders at 80x24 (minimum breakpoint)", async () => {
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("SNAP-AGT-003: agent chat stub renders at 120x40 with session id in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-chat", "--repo", "acme/api", "--session-id", "sess-001"],
      });

      await terminal.waitForText("Session");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("SNAP-AGT-004: agent replay stub renders at 120x40 with replay in breadcrumb", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "agent-replay", "--repo", "acme/api", "--session-id", "sess-001"],
      });

      await terminal.waitForText("Replay");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("SNAP-AGT-005: agent session list stub renders at 200x60 (large breakpoint)", async () => {
      const terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "agents", "--repo", "acme/api"],
      });

      await terminal.waitForText("Agent Sessions");
      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });

    test("SNAP-AGT-006: agent create stub renders at 120x40", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", "acme/api"],
      });

      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("New Agent Session");
      await terminal.waitForText("New Agent Session");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("New Agent Session");

      expect(terminal.snapshot()).toMatchSnapshot();

      await terminal.terminate();
    });
  });
});
