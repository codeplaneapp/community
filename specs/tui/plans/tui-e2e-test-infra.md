# Implementation Plan: tui-e2e-test-infra

## Overview
This document outlines the steps to implement the TUI E2E test infrastructure ticket `tui-e2e-test-infra`. It sets up the test harness utilizing `@microsoft/tui-test` to spawn and interact with TUI processes in isolation, upgrading the stubbed `helpers.ts` and wiring it to our existing test suites.

## 1. Update Dependencies and Scripts
**File:** `apps/tui/package.json`
- Add `@microsoft/tui-test` to `devDependencies`. Based on npm registry research, the available versions are in the `0.0.x` range, so we will use `^0.0.3` instead of the initially speculated `^0.3.0`.
- Add a `test:e2e` script to standardize running tests with the appropriate timeout.

**Modifications:**
```json
{
  "scripts": {
    "dev": "bun run src/index.tsx",
    "check": "tsc --noEmit",
    "test:e2e": "bun test ../../e2e/tui/ --timeout 30000"
  },
  "devDependencies": {
    "@microsoft/tui-test": "^0.0.3"
  }
}
```

## 2. Test Helpers Implementation
**File:** `e2e/tui/helpers.ts`
- Implement the `spawnTUI` wrapper leveraging `@microsoft/tui-test`.
- Return an object satisfying the `TUITestInstance` interface. The implementation must map methods (`sendKeys`, `sendText`, `waitForText`, `waitForNoText`, `snapshot`, `getLine`, `resize`, `terminate`) to the underlying `@microsoft/tui-test` instance primitives.
- Retain existing `TUI_ROOT`, `TUI_SRC`, `BUN`, `run()`, and `bunEval()` constants and functions intact, as they power structural tests.
- Export `createTestCredentialStore` and `createMockAPIEnv` to initialize the isolated mock state for the TUI instances.

## 3. Add Infrastructure Verification Tests
**File:** `e2e/tui/app-shell.test.ts`
Append a new describe block at the end of the file to explicitly verify the infrastructure tools, validating that imports resolve and helper functions execute without exceptions.

**Modifications:**
- Ensure `readFileSync` is imported from `node:fs` at the top of the file.
- Add the `createTestCredentialStore` and `createMockAPIEnv` imports from `./helpers`.
- Append the following block:

```typescript
// ---------------------------------------------------------------------------
// TUI_APP_SHELL_INFRA
// ---------------------------------------------------------------------------
describe("TUI E2E Infrastructure", () => {
  it("resolves test helpers correctly", () => {
    expect(createTestCredentialStore).toBeDefined();
    expect(createMockAPIEnv).toBeDefined();
  });
});
```