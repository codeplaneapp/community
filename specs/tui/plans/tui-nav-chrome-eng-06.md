# Implementation Plan: TUI E2E Test Infrastructure (`tui-nav-chrome-eng-06`)

## 1. Environment Setup
- **Create Bookmark:** Start by creating a new `jj` bookmark to track the implementation of the E2E infrastructure updates: `jj bookmark create tui-nav-chrome-eng-06`.

## 2. Harden E2E Helpers (`e2e/tui/helpers.ts`)

### A. Add Missing Constants & Interface Methods
- **Export `TERMINAL_SIZES`:** Add standard sizes for responsive testing.
  ```typescript
  export const TERMINAL_SIZES = {
    minimum:  { cols: 80,  rows: 24 },
    standard: { cols: 120, rows: 40 },
    large:    { cols: 200, rows: 60 },
  } as const;
  ```
- **Update `TUITestInstance` Interface:** Add regex support for text matching.
  ```typescript
  waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void>;
  ```

### B. Implement Dual-Backend Strategy in `launchTUI()`
- **Create `TuiTestBackend`:** Implement a wrapper around `@microsoft/tui-test`'s `Terminal` class. Map `TUITestInstance` methods to native methods (e.g., `sendKeys` -> `terminal.keyPress()`, `snapshot` -> `terminal.serialize().view`, `waitForText` -> locator assertions).
- **Create `BunSpawnBackend`:** Encapsulate the existing raw `Bun.spawn` + stdout buffering logic into its own class.
- **Update `launchTUI` logic:**
  - Attempt to instantiate `TuiTestBackend` first.
  - If the native binary fails to load, catch the error, log a warning, and fall back to `BunSpawnBackend`.
  - Add a readiness guard: wait for the initial screen (e.g., `await terminal.waitForText("Dashboard", options.launchTimeoutMs)`) before resolving the instance.
- **Implement `waitForMatch`:** In the fallback backend, use a polling loop evaluating `pattern.test(buffer)`.
- **Enhance Cleanup Guarantee:** Ensure `terminate()` cleanly kills processes and cleans up temporary config directories (like `CODEPLANE_CONFIG_DIR`) using a `finally` block or process exit hooks.

## 3. Scaffold Missing Feature Tests (`e2e/tui/app-shell.test.ts`)

Append the following `describe` blocks to ensure full coverage of `TUI_APP_SHELL` feature gaps identified in the spec.

### A. `TUI_HELP_OVERLAY`
```typescript
describe("TUI_APP_SHELL — Help overlay", () => {
  test("HELP-001: ? toggles help overlay on and off", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Help");
    await terminal.sendKeys("?");
    await terminal.waitForNoText("Help");
    await terminal.terminate();
  });

  test("HELP-002: Esc dismisses help overlay", async () => { /* similar implementation using Escape */ });
  test("HELP-003: help overlay shows context-sensitive keybindings", async () => { /* snapshot regex match for 'q.*back' and ':.*command' */ });
});
```

### B. `TUI_LOADING_STATES`
```typescript
describe("TUI_APP_SHELL — Loading states", () => {
  test("LOAD-001: initial screen shows loading indicator before data arrives", async () => { /* Assert presence of Loading... text or spinner */ });
  test("LOAD-002: loading spinner uses braille characters", async () => { /* Assert braille character match in buffer */ });
});
```

### C. `TUI_STATUS_BAR`
```typescript
describe("TUI_APP_SHELL — Status bar", () => {
  test("STATUS-001: status bar shows keybinding hints at standard size", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\?.*help/i);
    await terminal.terminate();
  });
  test("STATUS-002: status bar shows notification indicator", async () => { /* Assert notification badge exists in status bar */ });
});
```

### D. `TUI_ERROR_BOUNDARY`
```typescript
describe("TUI_APP_SHELL — Error boundary", () => {
  test("ERR-001: unhandled error renders recovery UI with restart hint", async () => { 
    /* Trigger an artificial error state and await recovery prompt "Press `r` to restart" */
  });
});
```

## 4. Verification
- **Execute Tests:** Run the test suite: `bun test e2e/tui/app-shell.test.ts --timeout 30000`
- **Validate Backend Usage:** Ensure the tests log whether they are utilizing the `TuiTestBackend` or the `BunSpawnBackend`.
- **Verify Failing Signals:** Allow tests targeting unimplemented backends or missing application routes to fail gracefully without hanging, ensuring they act as accurate signals for missing implementation.
- **Validate Isolation:** Confirm that multiple tests executing in sequence correctly setup and teardown their temporary API env variables and config directories.