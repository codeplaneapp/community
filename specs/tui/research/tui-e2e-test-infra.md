# TUI E2E Test Infrastructure Research Findings

## 1. Existing Test Stub (`e2e/tui/helpers.ts`)
The current `helpers.ts` file exports a stub for `launchTUI()` that unconditionally throws:
```typescript
export async function launchTUI(options?: { ... }): Promise<TUITestInstance> {
  throw new Error("TUITestInstance: Not yet implemented. This is a stub for E2E test scaffolding.");
}
```
It also exports structural testing utilities like `run()` (a wrapper around `Bun.spawn`) and `bunEval()`, alongside directory constants (`TUI_ROOT`, `TUI_SRC`, `BUN`).

## 2. Package Dependencies (`apps/tui/package.json`)
The package.json for `@codeplane/tui` lacks `@microsoft/tui-test` in its `devDependencies`. It currently lists:
```json
"devDependencies": {
  "typescript": "^5",
  "@types/react": "^19.0.0",
  "bun-types": "^1.3.11"
}
```

## 3. Package Availability (`@microsoft/tui-test`)
A registry check (`npm view @microsoft/tui-test versions`) confirms the package exists on the public npm registry, but the available versions are in the `0.0.x` range (latest is `0.0.3`), rather than `0.3.0` as mentioned in the specification. The package should be installed with the latest available version (e.g., `^0.0.3`) instead.

## 4. Test File Coverage (`e2e/tui/*.test.ts`)
- **`app-shell.test.ts`**: Contains comprehensive structural tests evaluating imports (OpenTUI hooks, React 19.x, and `@codeplane/sdk`). The file also contains UI navigation tests calling the `launchTUI()` stub, which are currently throwing the stub error.
- **`agents.test.ts` & `organizations.test.ts`**: Both files import `createTestTui` from `@microsoft/tui-test`, resulting in an unresolved module error during test execution.
- **`clipboard.test.ts` & `diff.test.ts`**: These files use unit-testing strategies (`bun:test` and local source imports) without relying on `@microsoft/tui-test`.

## 5. TUI Application Root (`apps/tui/src/index.tsx`)
The entry point `index.tsx` is currently a documented empty file that exports types (`CliRenderer`, `Root`) but does not execute any runtime logic or OpenTUI bootstrap sequences. Consequently, any successfully launched TUI instance during tests will exit immediately until `TUI_BOOTSTRAP_AND_RENDERER` is completed.

## 6. Project Configuration (`context/opentui`)
The directory `context/opentui/` is not present locally, meaning any `@opentui` utilities should be imported directly from the resolved npm package (`@opentui/core` or `@opentui/react` v0.1.90 as declared in `apps/tui/package.json`).