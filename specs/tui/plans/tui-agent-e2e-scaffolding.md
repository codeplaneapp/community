## Implementation Plan: Scaffold Agent E2E Test File with Helpers and Fixture Data (`tui-agent-e2e-scaffolding`)

This plan outlines the steps to create the E2E test scaffolding for the TUI agent feature group, focusing on `e2e/tui/agents.test.ts` with all required fixtures, helper functions, and 518 failing test stubs, as per the engineering specification.

### 1. Create `e2e/tui` Directory

**Purpose:** Establish the base directory for all TUI E2E tests, as it currently does not exist.

**Action:** Execute a shell command to create the directory.

```bash
mkdir -p e2e/tui
```

**Verification:** Confirm the directory `e2e/tui` is created.

### 2. Create `e2e/tui/helpers.ts` Stub

**Purpose:** Provide a minimal, placeholder implementation for `e2e/tui/helpers.ts`. This file is a prerequisite for `agents.test.ts` to compile and ensures that any test attempting to launch the TUI will immediately fail, as required for scaffolding.

**Action:** Write the stub content to `e2e/tui/helpers.ts`. The `launchTUI` function will throw an error to satisfy the requirement that tests fail against unimplemented functionality.

**File:** `e2e/tui/helpers.ts`

```typescript
export interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;
  sendText(text: string): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  snapshot(): string;
  getLine(lineNumber: number): string;
  resize(cols: number, rows: number): Promise<void>;
  terminate(): Promise<void>;
  rows: number;
  cols: number;
}

export async function launchTUI(options?: {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  args?: string[];
}): Promise<TUITestInstance> {
  throw new Error("TUITestInstance: Not yet implemented. This is a stub for E2E test scaffolding.");
}
```

**Verification:** Ensure the file is created with the specified content.

### 3. Create `e2e/tui/agents.test.ts` File Structure

**Purpose:** Initialize the main test file with necessary imports and a basic structure for test groups.

**Action:** Create the `e2e/tui/agents.test.ts` file and add the required imports. The content will be expanded in subsequent steps.

**File:** `e2e/tui/agents.test.ts`

```typescript
import { test, describe, expect } from "bun:test";
import { launchTUI, TUITestInstance } from "./helpers";

// --- Fixture Interfaces ---
interface AgentSessionFixture {
  id: string;
  title: string;
  status: "active" | "completed" | "failed" | "timed_out" | "pending";
  messageCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workflowRunId: string | null;
}

interface AgentMessagePartFixture {
  type: "text" | "tool_call" | "tool_result";
  content: unknown;
}

interface AgentMessageFixture {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  sequence: number;
  parts: AgentMessagePartFixture[];
  createdAt: string;
}

// --- Fixture Data ---
const agentSessionFixtures: AgentSessionFixture[] = [
  {
    id: "sess-001",
    title: "Refactor auth module",
    status: "active",
    messageCount: 4,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowRunId: null,
  },
  {
    id: "sess-002",
    title: "Add pagination to user list",
    status: "completed",
    messageCount: 8,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowRunId: "run-001",
  },
  {
    id: "sess-003",
    title: "Migrate database schema",
    status: "failed",
    messageCount: 3,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowRunId: null,
  },
  {
    id: "sess-004",
    title: "Review landing request #42",
    status: "timed_out",
    messageCount: 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowRunId: null,
  },
  {
    id: "sess-005",
    title: "Initial planning session",
    status: "pending",
    messageCount: 0,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowRunId: null,
  },
  {
    id: "sess-empty-title",
    title: "",
    status: "active",
    messageCount: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowRunId: null,
  },
  {
    id: "sess-max-title",
    title: "a".repeat(255), // 255-character string
    status: "active",
    messageCount: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowRunId: null,
  },
  {
    id: "sess-unicode-title",
    title: "修复认证模块 🔐 データベース移行", // Unicode string
    status: "active",
    messageCount: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowRunId: null,
  },
];

const agentMessageFixtures: AgentMessageFixture[] = [
  {
    id: "msg-001",
    sessionId: "sess-001",
    role: "user",
    sequence: 0,
    parts: [{ type: "text", content: "Can you fix the login timeout?" }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "msg-002",
    sessionId: "sess-001",
    role: "assistant",
    sequence: 1,
    parts: [
      {
        type: "text",
        content: `## Plan for login timeout fix\n\n\`\`\`typescript\n// Example code block\nfunction fixTimeout() { /* ... */ }\n\`\`\``,
      },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: "msg-003",
    sessionId: "sess-001",
    role: "assistant",
    sequence: 2,
    parts: [
      { type: "tool_call", id: "call-001", name: "read_file", input: JSON.stringify({ path: "src/auth/login.ts" }) },
      { type: "tool_result", id: "call-001", name: "read_file", output: "// Content of login.ts", isError: false },
      { type: "text", content: "I've reviewed the login file. Here are my thoughts." },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: "msg-004",
    sessionId: "sess-001",
    role: "system",
    sequence: 3,
    parts: [{ type: "text", content: "System instruction: You are a helpful assistant." }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "msg-005",
    sessionId: "sess-002",
    role: "user",
    sequence: 0,
    parts: [{ type: "text", content: "A".repeat(4000) }], // Long message
    createdAt: new Date().toISOString(),
  },
  {
    id: "msg-006",
    sessionId: "sess-002",
    role: "assistant",
    sequence: 1,
    parts: [
      {
        type: "text",
        content: `# Long response with nested markdown\n\n- Item 1\n  - Sub-item A\n- Item 2\n\n> Blockquote content\n\n\`\`\`javascript\nconsole.log("Nested code");\n\`\`\`\n` + "Response line.\n".repeat(100),
      },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: "msg-007",
    sessionId: "sess-002",
    role: "assistant",
    sequence: 2,
    parts: [
      { type: "tool_call", id: "call-002", name: "update_config", input: JSON.stringify({ someKey: "a".repeat(5000) }) }, // Large JSON args
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: "msg-008",
    sessionId: "sess-002",
    role: "assistant",
    sequence: 3,
    parts: [
      { type: "tool_result", id: "call-003", name: "deploy", output: JSON.stringify({ error: "Deployment failed" }), isError: true },
    ],
    createdAt: new Date().toISOString(),
  },
];

// --- Agent-Specific Helper Functions ---
async function navigateToAgents(terminal: TUITestInstance): Promise<void> {
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
}

async function createSession(terminal: TUITestInstance, title: string): Promise<void> {
  await terminal.sendKeys("n");
  await terminal.waitForText("Session title");
  await terminal.sendText(title);
  await terminal.sendKeys("Enter");
  await terminal.waitForText("message"); // Or a more specific chat screen element
}

async function navigateToChat(terminal: TUITestInstance, sessionIndex: number): Promise<void> {
  for (let i = 0; i < sessionIndex; i++) {
    await terminal.sendKeys("j");
  }
  await terminal.sendKeys("Enter");
  await terminal.waitForText("message"); // Or a more specific chat screen element
}

async function navigateToReplay(terminal: TUITestInstance, sessionIndex: number): Promise<void> {
  for (let i = 0; i < sessionIndex; i++) {
    await terminal.sendKeys("j");
  }
  await terminal.sendKeys("r");
  await terminal.waitForText("REPLAY");
}

async function sendMessage(terminal: TUITestInstance, text: string): Promise<void> {
  await terminal.sendText(text);
  await terminal.sendKeys("Enter");
  // Optimistic render verification: expect the message to appear in the conversation area
  await terminal.waitForText(text);
}

async function waitForStreaming(terminal: TUITestInstance): Promise<void> {
  // Braille spinner characters as per spec
  await terminal.waitForText("⠋", 100); // Wait for a short moment, as this is a stub
  // For a real implementation, this would involve a more robust check for any spinner character.
}

async function waitForStreamComplete(terminal: TUITestInstance): Promise<void> {
  // Braille spinner characters as per spec
  await terminal.waitForNoText("⠋", 100); // Wait for a short moment, as this is a stub
  await terminal.waitForNoText("⠙", 100);
  await terminal.waitForNoText("⠹", 100);
  // Add other spinner characters if needed for a real test
}

// --- Test Stubs (518 tests total) ---

// Feature Group: TUI_AGENT_SESSION_LIST (121 tests)
describe("TUI_AGENT_SESSION_LIST", () => {
  describe("Terminal Snapshot Tests", () => {
    for (let i = 1; i <= 28; i++) {
      test(`SNAP-AGENT-LIST-${String(i).padStart(3, "0")}: Placeholder snapshot test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Keyboard Interaction Tests", () => {
    for (let i = 1; i <= 42; i++) {
      test(`KEY-AGENT-LIST-${String(i).padStart(3, "0")}: Placeholder keyboard test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await terminal.sendKeys("j"); // Example key press
        // The actual assertion will cause failure because launchTUI throws.
        // For actual implementation, this would involve checking focus, text changes, etc.
        const focusedLine = terminal.getLine(5);
        expect(focusedLine).toMatch(/\x1b\[7m/); // Example assertion for focused line
        await terminal.terminate();
      });
    }
  });

  describe("Responsive Tests", () => {
    for (let i = 1; i <= 14; i++) {
      test(`RESP-AGENT-LIST-${String(i).padStart(3, "0")}: Placeholder responsive test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 80, rows: 24 });
        await navigateToAgents(terminal);
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Integration Tests", () => {
    for (let i = 1; i <= 22; i++) {
      test(`INT-AGENT-LIST-${String(i).padStart(3, "0")}: Placeholder integration test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        // This will fail because the TUI won't show it.
        // The spec implies these will fail naturally against an unimplemented backend.
        await terminal.waitForText("Auth error screen for testing", 100);
        await terminal.terminate();
      });
    }
  });

  describe("Edge Case Tests", () => {
    for (let i = 1; i <= 15; i++) {
      test(`EDGE-AGENT-LIST-${String(i).padStart(3, "0")}: Placeholder edge case test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        // Assertions for edge cases will go here. For now, they rely on the stub throwing.
        const visibleLine = terminal.getLine(5);
        expect(visibleLine).toMatch(/…/); // Example for truncation
        await terminal.terminate();
      });
    }
  });
});

// Feature Group: TUI_AGENT_CHAT_SCREEN (124 tests)
describe("TUI_AGENT_CHAT_SCREEN", () => {
  describe("Terminal Snapshot Tests", () => {
    for (let i = 1; i <= 28; i++) {
      test(`SNAP-CHAT-${String(i).padStart(3, "0")}: Placeholder snapshot test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0); // Navigate to first session chat
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Keyboard Interaction Tests", () => {
    for (let i = 1; i <= 42; i++) {
      test(`KEY-CHAT-${String(i).padStart(3, "0")}: Placeholder keyboard test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0);
        await terminal.sendKeys("j");
        const focusedLine = terminal.getLine(5);
        expect(focusedLine).toMatch(/\x1b\[7m/);
        await terminal.terminate();
      });
    }
  });

  describe("Responsive Tests", () => {
    for (let i = 1; i <= 14; i++) {
      test(`RESP-CHAT-${String(i).padStart(3, "0")}: Placeholder responsive test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 80, rows: 24 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0);
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Integration Tests", () => {
    for (let i = 1; i <= 24; i++) {
      test(`INT-CHAT-${String(i).padStart(3, "0")}: Placeholder integration test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0);
        await terminal.waitForText("Integration specific text", 100);
        await terminal.terminate();
      });
    }
  });

  describe("Edge Case Tests", () => {
    for (let i = 1; i <= 16; i++) {
      test(`EDGE-CHAT-${String(i).padStart(3, "0")}: Placeholder edge case test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0);
        expect(true).toBe(false); // Placeholder assertion
        await terminal.terminate();
      });
    }
  });
});

// Feature Group: TUI_AGENT_MESSAGE_SEND (101 tests)
describe("TUI_AGENT_MESSAGE_SEND", () => {
  describe("Terminal Snapshot Tests", () => {
    for (let i = 1; i <= 25; i++) {
      test(`SNAP-MSG-SEND-${String(i).padStart(3, "0")}: Placeholder snapshot test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0);
        await sendMessage(terminal, "Test message");
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Keyboard Interaction Tests", () => {
    for (let i = 1; i <= 40; i++) {
      test(`KEY-MSG-SEND-${String(i).padStart(3, "0")}: Placeholder keyboard test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0);
        await terminal.sendKeys("Enter"); // Simulate sending empty message or similar
        expect(true).toBe(false);
        await terminal.terminate();
      });
    }
  });

  describe("Responsive Tests", () => {
    for (let i = 1; i <= 16; i++) {
      test(`RESIZE-MSG-SEND-${String(i).padStart(3, "0")}: Placeholder responsive test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 80, rows: 24 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0);
        await sendMessage(terminal, "Resize test message");
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Edge Case Tests", () => {
    for (let i = 1; i <= 20; i++) {
      test(`EDGE-MSG-SEND-${String(i).padStart(3, "0")}: Placeholder edge case test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToChat(terminal, 0);
        await sendMessage(terminal, "A".repeat(1000)); // Long message
        expect(true).toBe(false);
        await terminal.terminate();
      });
    }
  });
});

// Feature Group: TUI_AGENT_SESSION_CREATE (78 tests)
describe("TUI_AGENT_SESSION_CREATE", () => {
  describe("Terminal Snapshot Tests", () => {
    for (let i = 1; i <= 14; i++) {
      test(`SNAP-CREATE-${String(i).padStart(3, "0")}: Placeholder snapshot test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await createSession(terminal, "New session title");
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Keyboard Interaction Tests", () => {
    for (let i = 1; i <= 28; i++) {
      test(`KEY-CREATE-${String(i).padStart(3, "0")}: Placeholder keyboard test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await terminal.sendKeys("n");
        await terminal.sendText("Title");
        await terminal.sendKeys("Esc"); // Simulate cancelling
        expect(true).toBe(false);
        await terminal.terminate();
      });
    }
  });

  describe("Responsive Tests", () => {
    for (let i = 1; i <= 10; i++) {
      test(`RESP-CREATE-${String(i).padStart(3, "0")}: Placeholder responsive test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 80, rows: 24 });
        await navigateToAgents(terminal);
        await createSession(terminal, "Responsive title");
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Integration Tests", () => {
    for (let i = 1; i <= 16; i++) {
      test(`INT-CREATE-${String(i).padStart(3, "0")}: Placeholder integration test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await terminal.sendKeys("n");
        await terminal.sendText("Integration session");
        await terminal.sendKeys("Enter");
        await terminal.waitForText("Session created successfully", 100);
        await terminal.terminate();
      });
    }
  });

  describe("Edge Case Tests", () => {
    for (let i = 1; i <= 10; i++) {
      test(`EDGE-CREATE-${String(i).padStart(3, "0")}: Placeholder edge case test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await createSession(terminal, ""); // Empty title
        expect(true).toBe(false);
        await terminal.terminate();
      });
    }
  });
});

// Feature Group: TUI_AGENT_SESSION_REPLAY (94 tests)
describe("TUI_AGENT_SESSION_REPLAY", () => {
  describe("Terminal Snapshot Tests", () => {
    for (let i = 1; i <= 22; i++) {
      test(`SNAP-REPLAY-${String(i).padStart(3, "0")}: Placeholder snapshot test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToReplay(terminal, 1); // Replay completed session
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Keyboard Interaction Tests", () => {
    for (let i = 1; i <= 32; i++) {
      test(`KEY-REPLAY-${String(i).padStart(3, "0")}: Placeholder keyboard test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToReplay(terminal, 1);
        await terminal.sendKeys("s"); // Simulate speed change or similar
        expect(true).toBe(false);
        await terminal.terminate();
      });
    }
  });

  describe("Responsive Tests", () => {
    for (let i = 1; i <= 12; i++) {
      test(`RESP-REPLAY-${String(i).padStart(3, "0")}: Placeholder responsive test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 80, rows: 24 });
        await navigateToAgents(terminal);
        await navigateToReplay(terminal, 1);
        expect(terminal.snapshot()).toMatchSnapshot();
        await terminal.terminate();
      });
    }
  });

  describe("Integration Tests", () => {
    for (let i = 1; i <= 16; i++) {
      test(`INT-REPLAY-${String(i).padStart(3, "0")}: Placeholder integration test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToReplay(terminal, 1);
        await terminal.waitForText("Replay specific event", 100);
        await terminal.terminate();
      });
    }
  });

  describe("Edge Case Tests", () => {
    for (let i = 1; i <= 12; i++) {
      test(`EDGE-REPLAY-${String(i).padStart(3, "0")}: Placeholder edge case test ${i}`, async () => {
        const terminal = await launchTUI({ cols: 120, rows: 40 });
        await navigateToAgents(terminal);
        await navigateToReplay(terminal, 4); // Replay pending session
        expect(true).toBe(false);
        await terminal.terminate();
      });
    }
  });
});
