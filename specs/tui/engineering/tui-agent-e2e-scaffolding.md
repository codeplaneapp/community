# Engineering Specification: `tui-agent-e2e-scaffolding`

## Scaffold Agent E2E Test File with Helpers and Fixture Data

---

## Summary

This ticket creates the E2E test scaffolding for the TUI agent feature group. The deliverable is a single file — `e2e/tui/agents.test.ts` — containing:

1. **Imports** from `@microsoft/tui-test` and `e2e/tui/helpers.ts`
2. **Test fixtures** for agent sessions and messages covering all statuses, edge-case titles, and all message part types
3. **Agent-specific helper functions** for common navigation and interaction patterns
4. **~518 test stubs** organized into `describe` blocks matching the five feature specs: `TUI_AGENT_SESSION_LIST`, `TUI_AGENT_CHAT_SCREEN`, `TUI_AGENT_MESSAGE_SEND`, `TUI_AGENT_SESSION_CREATE`, `TUI_AGENT_SESSION_REPLAY`
5. All tests are **left as failing test bodies** — never skipped, never commented out

This is a scaffolding-only ticket. No TUI screen implementation is required. No modifications to `apps/tui/src/` are needed.

---

## Implementation Plan

### Step 1: Verify Prerequisites

**Target**: No file changes — verification only.

Confirm that the following exist before proceeding:

| Dependency | Path | Required For |
|------------|------|-------------|
| TUI helpers | `e2e/tui/helpers.ts` | `launchTUI()`, `TUITestInstance` interface, test utilities |
| Test runner | `bun:test` | `describe`, `test`, `expect`, `beforeAll`, `afterAll` |
| TUI test framework | `@microsoft/tui-test` | Terminal snapshot matching, keyboard simulation |

If `e2e/tui/helpers.ts` does not exist, this ticket depends on the app-shell E2E scaffolding ticket that creates it. The helper file must provide at minimum:

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
}): Promise<TUITestInstance>;
```

If the helpers file does not yet exist, create a minimal stub at `e2e/tui/helpers.ts` that exports the `launchTUI` function and `TUITestInstance` interface with placeholder implementations that throw `"Not yet implemented"`. This allows the test file to compile and all tests to fail at runtime as expected.

### Step 2: Define Test Fixtures

**Target**: Top of `e2e/tui/agents.test.ts`

Define typed fixture data covering all entity shapes that agent tests require. Fixtures are defined as constants, not fetched from a server, because this is scaffolding for test structure — actual API integration will come when the backend is wired.

#### Session Fixtures (5 sessions with distinct statuses)

```typescript
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
```

| ID | Title | Status | Messages | Started | Finished | Workflow |
|----|-------|--------|----------|---------|----------|----------|
| `sess-001` | "Refactor auth module" | `active` | 4 | ISO timestamp | `null` | `null` |
| `sess-002` | "Add pagination to user list" | `completed` | 8 | ISO timestamp | ISO timestamp | `run-001` |
| `sess-003` | "Migrate database schema" | `failed` | 3 | ISO timestamp | ISO timestamp | `null` |
| `sess-004` | "Review landing request #42" | `timed_out` | 1 | ISO timestamp | ISO timestamp | `null` |
| `sess-005` | "Initial planning session" | `pending` | 0 | `null` | `null` | `null` |

#### Edge-Case Title Fixtures

| ID | Title | Purpose |
|----|-------|--------|
| `sess-empty-title` | `""` (empty string) | Tests "Untitled session" rendering |
| `sess-max-title` | 255-character string | Tests truncation at column boundaries |
| `sess-unicode-title` | `"修复认证模块 🔐 データベース移行"` | Tests grapheme-aware truncation |

#### Message Fixtures

```typescript
interface AgentMessageFixture {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  sequence: number;
  parts: AgentMessagePartFixture[];
  createdAt: string;
}

interface AgentMessagePartFixture {
  type: "text" | "tool_call" | "tool_result";
  content: unknown;
}
```

Fixture messages cover:

| Message | Role | Part Types | Content Notes |
|---------|------|-----------|---------------|
| `msg-001` | `user` | `[text]` | Short plain text: "Can you fix the login timeout?" |
| `msg-002` | `assistant` | `[text]` | Markdown with code block and heading |
| `msg-003` | `assistant` | `[tool_call, tool_result, text]` | Tool call to `read_file`, result with file contents, follow-up text |
| `msg-004` | `system` | `[text]` | System instruction |
| `msg-005` | `user` | `[text]` | Long message (4000 chars, boundary case) |
| `msg-006` | `assistant` | `[text]` | Long response with nested markdown (lists, blockquotes, code) |
| `msg-007` | `assistant` | `[tool_call]` | Tool call with large JSON arguments (~5KB) |
| `msg-008` | `assistant` | `[tool_result]` | Tool result with error response |

### Step 3: Create Agent-Specific Helper Functions

**Target**: `e2e/tui/agents.test.ts` (defined within the file, not exported — these are local helpers)

Six helper functions abstract common agent test interactions:

#### `navigateToAgents(terminal: TUITestInstance): Promise<void>`

Sends `g` then `a` (go-to agents keybinding) and waits for "Agent Sessions" text to appear in the terminal output.

```typescript
async function navigateToAgents(terminal: TUITestInstance): Promise<void> {
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
}
```

#### `createSession(terminal: TUITestInstance, title: string): Promise<void>`

From the agent session list, sends `n` to open the inline create input, types the title text, presses `Enter` to submit, and waits for the chat screen to appear (indicated by the "Type a message" or "Send a message" placeholder text).

```typescript
async function createSession(terminal: TUITestInstance, title: string): Promise<void> {
  await terminal.sendKeys("n");
  await terminal.waitForText("Session title");
  await terminal.sendText(title);
  await terminal.sendKeys("Enter");
  await terminal.waitForText("message");
}
```

#### `navigateToChat(terminal: TUITestInstance, sessionIndex: number): Promise<void>`

From the agent session list, moves focus to the specified row index using `j` presses (from the default first-row focus), then presses `Enter` to open the chat screen. Waits for the chat layout to appear.

```typescript
async function navigateToChat(terminal: TUITestInstance, sessionIndex: number): Promise<void> {
  for (let i = 0; i < sessionIndex; i++) {
    await terminal.sendKeys("j");
  }
  await terminal.sendKeys("Enter");
  await terminal.waitForText("message");
}
```

#### `navigateToReplay(terminal: TUITestInstance, sessionIndex: number): Promise<void>`

From the agent session list, moves focus to the specified row index using `j` presses, then presses `r` to enter replay mode. Waits for the "REPLAY" badge text to appear.

```typescript
async function navigateToReplay(terminal: TUITestInstance, sessionIndex: number): Promise<void> {
  for (let i = 0; i < sessionIndex; i++) {
    await terminal.sendKeys("j");
  }
  await terminal.sendKeys("r");
  await terminal.waitForText("REPLAY");
}
```

#### `sendMessage(terminal: TUITestInstance, text: string): Promise<void>`

Types the message text into the input field, presses `Enter` to send, and waits for the optimistic render (the message text appearing in the conversation history area, not in the input).

```typescript
async function sendMessage(terminal: TUITestInstance, text: string): Promise<void> {
  await terminal.sendText(text);
  await terminal.sendKeys("Enter");
  await terminal.waitForText(text);
}
```

#### `waitForStreaming(terminal: TUITestInstance): Promise<void>`

Waits for any braille spinner character (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) to appear in the terminal output, indicating the agent is streaming a response.

```typescript
async function waitForStreaming(terminal: TUITestInstance): Promise<void> {
  await terminal.waitForText("⠋");
}
```

#### `waitForStreamComplete(terminal: TUITestInstance): Promise<void>`

Waits for all braille spinner characters to disappear from the terminal output, indicating the streaming response is complete.

```typescript
async function waitForStreamComplete(terminal: TUITestInstance): Promise<void> {
  await terminal.waitForNoText("⠋");
  await terminal.waitForNoText("⠙");
  await terminal.waitForNoText("⠹");
}
```

### Step 4: Write Describe Blocks and Test Stubs

**Target**: `e2e/tui/agents.test.ts`

Organize tests into five top-level `describe` blocks corresponding to the five feature specs. Within each, nest `describe` blocks for test categories (snapshot, keyboard, responsive, integration, edge case).

#### Test Body Pattern

Every test stub has a failing body that exercises the helper and asserts a known-false condition, ensuring the test runs and fails. The pattern:

```typescript
test("SNAP-AGENT-LIST-001: Agent session list at 120×40 with mixed status sessions", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await navigateToAgents(terminal);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

This pattern:
- Launches a TUI instance (will fail if TUI is not implemented)
- Attempts the interaction (will fail if screens don't exist)
- Asserts state (will fail if rendering doesn't match)
- Cleans up the terminal instance

Tests are **never** wrapped in `test.skip()` or `test.todo()`. They are real `test()` calls with real bodies that will fail against the unimplemented backend.

#### Feature Group: `TUI_AGENT_SESSION_LIST` (121 tests)

```
describe("TUI_AGENT_SESSION_LIST")
  ├── describe("Terminal Snapshot Tests") — 28 tests (SNAP-AGENT-LIST-001 through 028)
  ├── describe("Keyboard Interaction Tests") — 42 tests (KEY-AGENT-LIST-001 through 042)
  ├── describe("Responsive Tests") — 14 tests (RESP-AGENT-LIST-001 through 014)
  ├── describe("Integration Tests") — 22 tests (INT-AGENT-LIST-001 through 022)
  └── describe("Edge Case Tests") — 15 tests (EDGE-AGENT-LIST-001 through 015)
```

#### Feature Group: `TUI_AGENT_CHAT_SCREEN` (124 tests)

```
describe("TUI_AGENT_CHAT_SCREEN")
  ├── describe("Terminal Snapshot Tests") — 28 tests (SNAP-CHAT-001 through 028)
  ├── describe("Keyboard Interaction Tests") — 42 tests (KEY-CHAT-001 through 042)
  ├── describe("Responsive Tests") — 14 tests (RESP-CHAT-001 through 014)
  ├── describe("Integration Tests") — 24 tests (INT-CHAT-001 through 024)
  └── describe("Edge Case Tests") — 16 tests (EDGE-CHAT-001 through 016)
```

#### Feature Group: `TUI_AGENT_MESSAGE_SEND` (101 tests)

```
describe("TUI_AGENT_MESSAGE_SEND")
  ├── describe("Terminal Snapshot Tests") — 25 tests (SNAP-MSG-SEND-001 through 025)
  ├── describe("Keyboard Interaction Tests") — 40 tests (KEY-MSG-SEND-001 through 040)
  ├── describe("Responsive Tests") — 16 tests (RESIZE-MSG-SEND-001 through 016)
  └── describe("Edge Case Tests") — 20 tests (EDGE-MSG-SEND-001 through 020)
```

#### Feature Group: `TUI_AGENT_SESSION_CREATE` (78 tests)

```
describe("TUI_AGENT_SESSION_CREATE")
  ├── describe("Terminal Snapshot Tests") — 14 tests (SNAP-CREATE-001 through 014)
  ├── describe("Keyboard Interaction Tests") — 28 tests (KEY-CREATE-001 through 028)
  ├── describe("Responsive Tests") — 10 tests (RESP-CREATE-001 through 010)
  ├── describe("Integration Tests") — 16 tests (INT-CREATE-001 through 016)
  └── describe("Edge Case Tests") — 10 tests (EDGE-CREATE-001 through 010)
```

#### Feature Group: `TUI_AGENT_SESSION_REPLAY` (94 tests)

```
describe("TUI_AGENT_SESSION_REPLAY")
  ├── describe("Terminal Snapshot Tests") — 22 tests (SNAP-REPLAY-001 through 022)
  ├── describe("Keyboard Interaction Tests") — 32 tests (KEY-REPLAY-001 through 032)
  ├── describe("Responsive Tests") — 12 tests (RESP-REPLAY-001 through 012)
  ├── describe("Integration Tests") — 16 tests (INT-REPLAY-001 through 016)
  └── describe("Edge Case Tests") — 12 tests (EDGE-REPLAY-001 through 012)
```

**Total: 518 tests.**

### Step 5: Verify File Compiles

**Target**: `e2e/tui/agents.test.ts`

Run `bun build --no-bundle e2e/tui/agents.test.ts` (or equivalent type-check) to confirm the file has no TypeScript compilation errors. The file should:

- Import correctly from `bun:test`
- Import correctly from `e2e/tui/helpers.ts` (or its stub)
- Define all fixture types inline (no external type imports required for scaffolding)
- Compile with strict TypeScript

---

## Unit & Integration Tests

### Test File: `e2e/tui/agents.test.ts`

This **is** the test file. The entire deliverable of this ticket is the test scaffolding itself. There are no separate unit tests for the scaffolding — the test file is validated by:

1. **TypeScript compilation**: The file must compile without errors under `bun build`
2. **Test discovery**: Running `bun test e2e/tui/agents.test.ts` must discover all 518 tests
3. **Uniform failure**: All 518 tests must fail (not skip, not pass) — verifying that test bodies are real assertions against unimplemented functionality

### Test Structure Validation

The test file structure follows these invariants:

| Property | Expected |
|----------|----------|
| Top-level `describe` blocks | 5 (one per feature group) |
| Nested `describe` blocks | 24 (snapshot/keyboard/responsive/integration/edge per feature, except MESSAGE_SEND which has no integration section) |
| Total `test()` calls | 518 |
| `test.skip()` calls | 0 |
| `test.todo()` calls | 0 |
| Commented-out tests | 0 |
| `beforeAll` blocks | 1 (top-level, launches TUI and sets up repo context) |
| `afterAll` blocks | 1 (top-level, terminates TUI) |

### Test Categories and Their Patterns

#### Terminal Snapshot Tests (117 total across all groups)

Pattern:
```typescript
test("SNAP-AGENT-LIST-001: Agent session list at 120×40 with mixed status sessions", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await navigateToAgents(terminal);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

These tests:
- Launch TUI at a specific terminal size
- Navigate to the target screen
- Capture a terminal snapshot
- Assert via `toMatchSnapshot()` (golden file comparison)
- Terminate the TUI instance

Snapshot golden files are stored alongside the test file and regenerated when the implementation is complete.

#### Keyboard Interaction Tests (184 total across all groups)

Pattern:
```typescript
test("KEY-AGENT-LIST-001: j moves focus down one row", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await navigateToAgents(terminal);
  await terminal.sendKeys("j");
  const focusedLine = terminal.getLine(5);
  expect(focusedLine).toMatch(/\x1b\[7m/);
  await terminal.terminate();
});
```

These tests:
- Launch TUI and navigate to the target screen
- Send specific keypress sequences
- Assert on terminal content changes (text, highlights, screen transitions)
- Terminate the TUI instance

#### Responsive Tests (66 total across all groups)

Pattern:
```typescript
test("RESP-AGENT-LIST-001: 80×24 layout shows only status icon, title, timestamp", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  await navigateToAgents(terminal);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

These tests:
- Launch at one size, optionally resize to another
- Assert layout adaptation (column visibility, padding, truncation)
- Verify state preservation across resizes

#### Integration Tests (78 total across all groups)

Pattern:
```typescript
test("INT-AGENT-LIST-001: Auth expiry (401) during list fetch — auth error screen shown", async () => {
  const terminal = await launchTUI({
    cols: 120,
    rows: 40,
    env: { CODEPLANE_TOKEN: "expired-token" },
  });
  await navigateToAgents(terminal);
  await terminal.waitForText("Session expired");
  await terminal.terminate();
});
```

These tests:
- Test against real API endpoints (or fail because they're unimplemented)
- Verify error handling, pagination, SSE streaming, and cross-screen navigation

#### Edge Case Tests (73 total across all groups)

Pattern:
```typescript
test("EDGE-AGENT-LIST-002: Long title (255 chars) — truncated with ellipsis", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await navigateToAgents(terminal);
  const visibleLine = terminal.getLine(5);
  expect(visibleLine).toMatch(/…/);
  await terminal.terminate();
});
```

These tests:
- Exercise boundary conditions (max lengths, zero items, unicode, rapid input)
- Verify graceful degradation and no crashes

### Running the Tests

```bash
# Discover and run all agent E2E tests
bun test e2e/tui/agents.test.ts

# Expected: 518 tests discovered, 518 failed, 0 passed, 0 skipped
```

---

## File Inventory

| File | Action | Purpose |
|------|--------|--------|
| `e2e/tui/agents.test.ts` | **Create** | Main deliverable — 518 test stubs with fixtures and helpers |
| `e2e/tui/helpers.ts` | **Verify exists** or **Create stub** | Required dependency for `launchTUI()` |

No files in `apps/tui/src/` are created or modified by this ticket.

---

## Productionization Path

This ticket produces scaffolding. Here is how each piece graduates to production:

### Fixtures → Real API Data

The hardcoded fixture constants will be replaced by `beforeAll` setup code that:
1. Creates a test repository via `cli(["repo", "create", ...])`
2. Creates agent sessions via `POST /api/repos/:owner/:repo/agent/sessions`
3. Posts messages via `POST /api/repos/:owner/:repo/agent/sessions/:id/messages`
4. Stores returned IDs for test assertions

The fixture type interfaces remain as documentation of expected shapes.

### Helper Functions → Stable Utilities

The helper functions (`navigateToAgents`, `createSession`, etc.) are designed to be stable across implementation changes. They interact at the user level (keystrokes and visible text), not at the implementation level (component names, state). They should:
- Be moved to a shared helper file if other test files need them
- Add timeout parameters for CI reliability
- Add error messages for common failure modes

### Test Stubs → Real Assertions

Each test stub follows the pattern: launch → navigate → interact → assert → terminate. When the backend and frontend are implemented:
1. Tests will begin passing one by one as features are completed
2. Snapshot golden files will be generated on first successful run
3. No test bodies need structural changes — they already assert the right behavior
4. Tests that depend on SSE streaming will require the API server's SSE endpoint to be functional

### `helpers.ts` Stub → Real Implementation

If `e2e/tui/helpers.ts` is created as a stub by this ticket, it must be replaced by the real implementation (from the app-shell E2E ticket) before any tests can pass. The stub's only purpose is to allow the test file to compile.

---

## Dependencies and Ordering

| Dependency | Status | Blocking? |
|------------|--------|----------|
| `e2e/tui/helpers.ts` (launchTUI) | May not exist yet | No — create stub if missing |
| `@microsoft/tui-test` in devDependencies | Must be installed | Yes — required for imports |
| `bun:test` | Built-in | No |
| Agent screen implementation (`apps/tui/src/`) | Not started | No — tests are designed to fail |
| API server agent endpoints | Partially implemented | No — tests are designed to fail |

---

## Acceptance Criteria

- [ ] `e2e/tui/agents.test.ts` exists and compiles without TypeScript errors
- [ ] The file imports from `@microsoft/tui-test` and `e2e/tui/helpers.ts`
- [ ] 5 session fixtures with statuses: active, completed, failed, timed_out, pending
- [ ] 3 edge-case title fixtures: empty, 255-char, unicode
- [ ] Message fixtures covering text, tool_call, tool_result part types
- [ ] Message fixtures with markdown, code blocks, and long content
- [ ] `navigateToAgents()` helper sends `g a` and waits for "Agent Sessions"
- [ ] `createSession()` helper sends `n`, types title, presses Enter, waits for chat
- [ ] `navigateToChat()` helper focuses row by index and presses Enter
- [ ] `navigateToReplay()` helper focuses row by index and presses `r`
- [ ] `sendMessage()` helper types text, presses Enter, waits for optimistic render
- [ ] `waitForStreaming()` waits for braille spinner character
- [ ] `waitForStreamComplete()` waits for spinner to disappear
- [ ] 5 top-level `describe` blocks matching feature groups
- [ ] 518 total `test()` calls (121 + 124 + 101 + 78 + 94)
- [ ] 0 `test.skip()` or `test.todo()` calls
- [ ] 0 commented-out test bodies
- [ ] All tests have real failing bodies (launch TUI, navigate, assert)
- [ ] `bun test e2e/tui/agents.test.ts` discovers all 518 tests