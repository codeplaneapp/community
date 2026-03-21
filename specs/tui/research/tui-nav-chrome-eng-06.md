# Research Findings: TUI E2E Test Infrastructure (`tui-nav-chrome-eng-06`)

## 1. Overview

This document outlines the findings from researching the existing Codeplane TUI E2E test infrastructure. The research focuses on the `e2e/tui/` directory, specifically `helpers.ts`, `app-shell.test.ts`, the `helpers/` domain modules, and how they integrate with the React 19 + OpenTUI application.

## 2. Current Implementation State (`e2e/tui/`)

### `helpers.ts`
The main testing harness is substantially implemented and provides the core foundation for all E2E tests:
- **`TUITestInstance` Interface**: Defines the contract for interacting with the TUI (e.g., `sendKeys`, `sendText`, `waitForText`, `snapshot`, `getLine`, `resize`, `terminate`).
- **`launchTUI()`**: A robust fallback implementation using `Bun.spawn` that launches the TUI process (`apps/tui/src/index.tsx`), pipes `stdout`, and tracks the buffer as a string. It applies default environment variables (`TERM=xterm-256color`, `COLORTERM=truecolor`, `NO_COLOR=""`, etc.).
- **Mock Environments**: Provides `createTestCredentialStore` and `createMockAPIEnv` to inject mock configurations and test tokens, bypassing standard authentication flows.
- **Subprocess Utilities**: Contains `run()` and `bunEval()` to test dependency resolution and pure TypeScript compilation paths.
- **Domain Navigation**: Includes initial navigation helpers like `navigateToAgents`, `waitForSessionListReady`, and `navigateToAgentChat`.

### `bunfig.toml`
Exists and correctly configures the bun test runner:
```toml
[test]
timeout = 30000
preload = []
```

### Domain Specific Helpers (`e2e/tui/helpers/`)
- **`workspaces.ts`**: Contains extensive workspace testing utilities, including `WORKSPACE_IDS`, `WORKSPACE_FIXTURES`, `launchTUIWithWorkspaceContext`, `waitForStatusTransition`, SSE event generators (`createWorkspaceStatusEvent`), and row assertion utilities (`assertWorkspaceRow`, `hasReverseVideo`).
- **`workflows.ts`**: Contains navigation and streaming helpers like `navigateToWorkflowRunDetail`, `waitForLogStreaming`, and an SSE injection file creator.

### `app-shell.test.ts`
A massive scaffold (~2045 lines) encompassing the majority of `TUI_APP_SHELL` feature validations. Current implementations include:
- **Navigation Provider**: Deep stack navigation, breadcrumb behaviors, deep-link launches, tab replacements, go-to bindings, and edge cases.
- **Screen Registry**: Verification of placeholder rendering, command palette routing, fallback behaviors, and responsive snapshots at various breakpoints (`120x40`, `80x24`, `200x60`).
- **Package Scaffold & Compilation**: Asserts `package.json` configurations, `tsconfig.json` correctness (OpenTUI JSX, no DOM), and successful `tsc --noEmit` checks.
- **Dependency Resolution**: Runtime tests validating that `@opentui/core`, `@opentui/react`, and React 19 resolve successfully.
- **Color Capability Detection**: Comprehensive matrix testing of `theme/detect.ts` matching `NO_COLOR`, `COLORTERM`, and `TERM` values to determine `truecolor`, `ansi256`, or `ansi16` tiers.

## 3. Identified Gaps & Engineering Spec Alignment

As noted in the engineering spec, the following test coverage groups are entirely missing from `e2e/tui/app-shell.test.ts` and need to be scaffolded:

1. **`TUI_HELP_OVERLAY`**: Needs tests asserting that `?` toggles the help overlay, `Esc` dismisses it, and that it accurately reflects context-sensitive keybindings.
2. **`TUI_LOADING_STATES`**: Needs tests to assert the initial screen shows a loading indicator before data arrives (e.g., braille spinners via `useSpinner`).
3. **`TUI_STATUS_BAR`**: Needs tests to assert keybinding hints and notification indicators render at the bottom of the screen (`apps/tui/src/components/StatusBar.tsx` exists and handles this).
4. **`TUI_ERROR_BOUNDARY`**: Needs tests for unhandled error rendering and recovery UI prompts (`apps/tui/src/components/ErrorBoundary.tsx` is implemented).

Additionally, the `TUITestInstance` and `launchTUI` implementation in `helpers.ts` must be modernized:
- Integration with `@microsoft/tui-test` (installed as `workspace:*` in `apps/tui/package.json`) should become the primary backend if available, replacing the string-concatenation buffer polling with true virtual terminal buffer queries (`getBuffer()`, `getByText()`).
- Addition of a regex-compatible `waitForMatch(pattern: RegExp)` method.

## 4. Key Component Paths in `apps/tui/src/`
To properly assert against these missing features, tests will target the behavior of these existing components:
- **Error Boundary**: `apps/tui/src/components/ErrorBoundary.tsx`
- **Status Bar**: `apps/tui/src/components/StatusBar.tsx` 
- **Loading/Spinner logic**: Scattered across screens (e.g., `TabbedDetailView`, Agent screens) and specifically `apps/tui/src/hooks/useSpinner.ts`.

## 5. Conclusion
The foundation is stable. The required work consists of augmenting `app-shell.test.ts` with the four missing `describe` blocks (`HELP`, `LOADING`, `STATUS`, `ERROR`), and progressively migrating `helpers.ts` to utilize `@microsoft/tui-test` for superior snapshot accuracy and terminal layout emulation.