import { describe, test, expect } from "bun:test";
import {
  WORKSPACE_FIXTURES,
  WORKSPACE_IDS,
  createWorkspaceFixture,
  type WorkspaceFixtureName,
  createWorkspaceStatusEvent,
  createSessionStatusEvent,
  createSSEInjectionFile,
  stripAnsi,
  hasReverseVideo,
  assertWorkspaceRow,
} from "../workspaces.js";
import { readFileSync, existsSync } from "node:fs";
import type { TUITestInstance } from "../../helpers.js";

describe("Workspace Test Fixtures", () => {
  test("FIX-001: all fixture IDs are unique UUIDs", () => {
    const ids = Object.values(WORKSPACE_IDS);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const id of ids) {
      expect(id).toMatch(uuidRegex);
    }
  });

  test("FIX-002: all fixture statuses match their key name", () => {
    const keys: WorkspaceFixtureName[] = ["running", "suspended", "starting", "failed", "pending", "stopped"];
    for (const key of keys) {
      expect(WORKSPACE_FIXTURES[key].status).toBe(key);
    }
  });

  test("FIX-003: running fixture has ssh_host set", () => {
    expect(WORKSPACE_FIXTURES.running.ssh_host).toBeDefined();
    expect(WORKSPACE_FIXTURES.running.ssh_host).not.toBe("");
  });

  test("FIX-004: suspended fixture has suspended_at set", () => {
    expect(WORKSPACE_FIXTURES.suspended.suspended_at).not.toBeNull();
    expect(WORKSPACE_FIXTURES.suspended.suspended_at).toBe("2026-01-15T11:00:00.000Z");
  });

  test("FIX-005: non-suspended fixtures have suspended_at as null", () => {
    for (const key of ["running", "starting", "failed", "pending", "stopped"] as const) {
      expect(WORKSPACE_FIXTURES[key].suspended_at).toBeNull();
    }
  });

  test("FIX-006: all fixtures share the same repository_id and user_id", () => {
    for (const fixture of Object.values(WORKSPACE_FIXTURES)) {
      expect(fixture.repository_id).toBe(42);
      expect(fixture.user_id).toBe(1);
    }
  });

  test("FIX-007: all fixture timestamps are deterministic ISO 8601", () => {
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    for (const fixture of Object.values(WORKSPACE_FIXTURES)) {
      expect(fixture.created_at).toMatch(isoRegex);
      expect(fixture.updated_at).toMatch(isoRegex);
    }
  });

  test("FIX-008: createWorkspaceFixture produces valid WorkspaceResponse with overrides", () => {
    const custom = createWorkspaceFixture({
      id: "custom-uuid-1234-5678-9abc-def012345678",
      name: "custom-workspace",
      status: "running",
      ssh_host: "custom.host.test",
    });
    expect(custom.id).toBe("custom-uuid-1234-5678-9abc-def012345678");
    expect(custom.name).toBe("custom-workspace");
    expect(custom.status).toBe("running");
    expect(custom.ssh_host).toBe("custom.host.test");
    expect(custom.repository_id).toBe(42);
  });

  test("FIX-009: createWorkspaceFixture overrides take precedence over defaults", () => {
    const custom = createWorkspaceFixture({
      name: "override-test",
      status: "failed",
      repository_id: 99,
      user_id: 7,
    });
    expect(custom.repository_id).toBe(99);
    expect(custom.user_id).toBe(7);
  });

  test("FIX-010: all fixtures have required WorkspaceResponse fields", () => {
    const requiredFields: (keyof typeof WORKSPACE_FIXTURES.running)[] = [
      "id", "repository_id", "user_id", "name", "status",
      "is_fork", "freestyle_vm_id", "persistence",
      "idle_timeout_seconds", "created_at", "updated_at",
    ];
    for (const fixture of Object.values(WORKSPACE_FIXTURES)) {
      for (const field of requiredFields) {
        expect(fixture).toHaveProperty(field as string);
      }
    }
  });
});

describe("SSE Event Construction", () => {
  test("SSE-001: createWorkspaceStatusEvent produces correct wire format", () => {
    const event = createWorkspaceStatusEvent("abc-123", "running");
    expect(event.type).toBe("workspace.status");
    const data = JSON.parse(event.data);
    expect(data.workspace_id).toBe("abc-123");
    expect(data.status).toBe("running");
  });

  test("SSE-002: createWorkspaceStatusEvent accepts custom event ID", () => {
    const event = createWorkspaceStatusEvent("abc-123", "suspended", "custom-id-42");
    expect(event.id).toBe("custom-id-42");
  });

  test("SSE-003: createSessionStatusEvent produces correct wire format", () => {
    const event = createSessionStatusEvent("session-456", "stopped");
    expect(event.type).toBe("workspace.session");
    const data = JSON.parse(event.data);
    expect(data.session_id).toBe("session-456");
    expect(data.status).toBe("stopped");
  });

  test("SSE-004: event data field is valid JSON", () => {
    const event = createWorkspaceStatusEvent("id-1", "failed");
    expect(() => JSON.parse(event.data)).not.toThrow();
  });

  test("SSE-005: event type matches server wire format", () => {
    const wsEvent = createWorkspaceStatusEvent("id", "running");
    expect(wsEvent.type).toBe("workspace.status");
    const sessEvent = createSessionStatusEvent("id", "running");
    expect(sessEvent.type).toBe("workspace.session");
  });
});

describe("SSE Injection File", () => {
  test("SSE-INJ-001: createSSEInjectionFile creates file and returns path", () => {
    const { filePath, cleanup } = createSSEInjectionFile();
    try {
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toMatch(/sse-events\.jsonl$/);
    } finally {
      cleanup();
    }
  });

  test("SSE-INJ-002: writeEvent appends JSONL line to file", () => {
    const { filePath, writeEvent, cleanup } = createSSEInjectionFile();
    try {
      const event = createWorkspaceStatusEvent("ws-1", "running", "evt-1");
      writeEvent(event);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0])).toEqual(event);
    } finally {
      cleanup();
    }
  });

  test("SSE-INJ-003: writeEvents appends multiple JSONL lines", () => {
    const { filePath, writeEvents, cleanup } = createSSEInjectionFile();
    try {
      const events = [
        createWorkspaceStatusEvent("ws-1", "starting", "evt-1"),
        createWorkspaceStatusEvent("ws-1", "running", "evt-2"),
      ];
      writeEvents(events);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).id).toBe("evt-1");
      expect(JSON.parse(lines[1]).id).toBe("evt-2");
    } finally {
      cleanup();
    }
  });

  test("SSE-INJ-004: cleanup removes the temp directory", () => {
    const { filePath, cleanup } = createSSEInjectionFile();
    cleanup();
    expect(existsSync(filePath)).toBe(false);
  });

  test("SSE-INJ-005: multiple writeEvent calls append sequentially", () => {
    const { filePath, writeEvent, cleanup } = createSSEInjectionFile();
    try {
      writeEvent(createWorkspaceStatusEvent("ws-1", "pending", "evt-1"));
      writeEvent(createWorkspaceStatusEvent("ws-1", "starting", "evt-2"));
      writeEvent(createWorkspaceStatusEvent("ws-1", "running", "evt-3"));
      const lines = readFileSync(filePath, "utf-8").trim().split("\n");
      expect(lines.length).toBe(3);
      const statuses = lines.map((l) => JSON.parse(JSON.parse(l).data).status);
      expect(statuses).toEqual(["pending", "starting", "running"]);
    } finally {
      cleanup();
    }
  });
});

describe("String Utilities", () => {
  test("UTIL-001: stripAnsi removes color codes", () => {
    expect(stripAnsi("\x1b[32mgreen\x1b[0m")).toBe("green");
  });

  test("UTIL-002: stripAnsi preserves plain text", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  test("UTIL-003: stripAnsi handles multiple escape sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[34mbold blue\x1b[0m text")).toBe("bold blue text");
  });

  test("UTIL-004: hasReverseVideo detects \\x1b[7m", () => {
    expect(hasReverseVideo("\x1b[7mfocused\x1b[0m")).toBe(true);
    expect(hasReverseVideo("not focused")).toBe(false);
  });
});

describe("assertWorkspaceRow", () => {
  function mockTerminal(lines: string[]): TUITestInstance {
    return {
      getLine: (n: number) => {
        if (n < 0 || n >= lines.length) throw new Error(`Line ${n} out of range`);
        return lines[n];
      },
    } as unknown as TUITestInstance;
  }

  test("ASSERT-001: passes when name matches", () => {
    const terminal = mockTerminal(["  \x1b[32mdev-environment\x1b[0m   running"]);
    expect(() => assertWorkspaceRow(terminal, 0, { name: "dev-environment" })).not.toThrow();
  });

  test("ASSERT-002: throws when name does not match", () => {
    const terminal = mockTerminal(["  dev-environment   running"]);
    expect(() => assertWorkspaceRow(terminal, 0, { name: "staging-env" })).toThrow(/expected name.*staging-env/);
  });

  test("ASSERT-003: passes when status matches (case insensitive)", () => {
    const terminal = mockTerminal(["  dev-environment   \x1b[32mRunning\x1b[0m"]);
    expect(() => assertWorkspaceRow(terminal, 0, { status: "running" })).not.toThrow();
  });

  test("ASSERT-004: detects focused row via reverse video", () => {
    const terminal = mockTerminal(["\x1b[7m  dev-environment   running\x1b[0m"]);
    expect(() => assertWorkspaceRow(terminal, 0, { focused: true })).not.toThrow();
    expect(() => assertWorkspaceRow(terminal, 0, { focused: false })).toThrow(/expected focused=false/);
  });

  test("ASSERT-005: passes when contains text is present", () => {
    const terminal = mockTerminal(["  dev-environment   running   ws-host.test"]);
    expect(() => assertWorkspaceRow(terminal, 0, { contains: "ws-host" })).not.toThrow();
  });

  test("ASSERT-006: passes when notContains text is absent", () => {
    const terminal = mockTerminal(["  dev-environment   running"]);
    expect(() => assertWorkspaceRow(terminal, 0, { notContains: "ssh_host" })).not.toThrow();
  });

  test("ASSERT-007: throws when notContains text is present", () => {
    const terminal = mockTerminal(["  dev-environment   running   ssh_host"]);
    expect(() => assertWorkspaceRow(terminal, 0, { notContains: "ssh_host" })).toThrow(/unexpected text/);
  });

  test("ASSERT-008: multiple expectations are checked in single call", () => {
    const terminal = mockTerminal(["\x1b[7m  dev-environment   \x1b[32mrunning\x1b[0m"]);
    expect(() =>
      assertWorkspaceRow(terminal, 0, {
        name: "dev-environment",
        status: "running",
        focused: true,
      }),
    ).not.toThrow();
  });

  test("ASSERT-009: error message includes actual line content", () => {
    const terminal = mockTerminal(["actual content here"]);
    try {
      assertWorkspaceRow(terminal, 0, { name: "missing" });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).toContain("actual content here");
    }
  });
});
