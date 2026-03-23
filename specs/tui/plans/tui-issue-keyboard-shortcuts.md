# Implementation Plan: tui-issue-keyboard-shortcuts

This document outlines the step-by-step implementation plan for the `tui-issue-keyboard-shortcuts` feature in the Codeplane TUI. It establishes the 6-layer priority keybinding architecture, orchestration hook, help overlay rendering, and go-to mode routing.

## 1. Setup Keyboard Core Types and Constants

1. **Create `apps/tui/src/screens/Issues/keyboard/constants.ts`**
   - Define `ISSUE_WIDE_PRIORITY = 4.5` as a constant to sit between `SCREEN` (4) and `GLOBAL` (5).
   - Define layout and performance constants: `GOTO_TIMEOUT_MS = 1500`, `MAX_HELP_GROUPS = 8`, `MAX_HELP_PER_GROUP = 20`, `MAX_HELP_TOTAL = 80`, `HANDLER_BUDGET_MS = 16`, `KEY_QUEUE_DEPTH = 64`.

2. **Create `apps/tui/src/screens/Issues/keyboard/types.ts`**
   - Export necessary types including `IssueSubScreen`, `FocusContext`, `ResponsiveHintConfig`, `HelpGroup`, `HelpEntry`, and `GoToModeState`.

## 2. Core Keyboard Hooks

1. **Create `apps/tui/src/screens/Issues/keyboard/useGoToMode.ts`**
   - Implement the Go-To mode state machine (activation on `g`, 1500ms timeout, `goToBindings` destination resolution, `g g` top scroll).
   - Hook into the `PRIORITY.GOTO` scope with dynamic catch-all to prevent fall-through.

2. **Create `apps/tui/src/screens/Issues/keyboard/useIssueStatusBarHints.ts`**
   - Build a pure computation hook for `StatusBarHint[]` relying on `subScreen`, `focusContext`, and the `useTerminalDimensions()` hook to calculate breakpoint-specific truncations.

3. **Create `apps/tui/src/screens/Issues/keyboard/useEscCascade.ts`**
   - Implement priority logic for `Escape` handling: 1) Active overlays, 2) Active search focus, 3) Form dirty state check, 4) Pop screen fallback.

## 3. Orchestration & Content Components

1. **Create `apps/tui/src/screens/Issues/keyboard/HelpOverlayContent.tsx`**
   - Build a `<scrollbox>` component using OpenTUI to render grouped keyboard bindings dynamically.
   - Consume `KeybindingContext.getAllBindings()` to aggregate and partition bindings.
   - Implement responsive layouts (1-column vs. 2-column on `large` breakpoint).

2. **Create `apps/tui/src/screens/Issues/keyboard/issueCommands.ts`**
   - Define the `ISSUE_COMMANDS` array containing the command palette actions (create, edit, filter, etc.).

3. **Create `apps/tui/src/screens/Issues/keyboard/useIssueKeyboard.ts`**
   - Act as the central orchestration hook uniting `useGoToMode`, `useEscCascade`, `useIssueStatusBarHints`, and screen-specific mappings.
   - Register the issue-wide scope (`PRIORITY = 4.5`) containing fallback `R` (retry) and the integrated `Escape` cascade.

4. **Create `apps/tui/src/screens/Issues/keyboard/index.ts`**
   - Export all types, hooks, and components as a barrel module.

## 4. Context & Global Provider Integration

1. **Create `apps/tui/src/providers/GoToContext.tsx`**
   - Define `GoToProvider` to manage global Go-To trigger registration. Allows active screens to register their Go-To activation callback.

2. **Update `apps/tui/src/index.tsx`**
   - Inject `<GoToProvider>` into the application's provider tree (between `KeybindingProvider` and `OverlayManager`).

3. **Update `apps/tui/src/components/GlobalKeybindings.tsx`**
   - Remove `/* TODO */` stubs and implement real callbacks.
   - `onHelp`: Call `openOverlay("help")`.
   - `onCommandPalette`: Call `openOverlay("command-palette")`.
   - `onGoTo`: Trigger the `GoToContext` activation method.

4. **Update `apps/tui/src/components/OverlayLayer.tsx`**
   - Import `HelpOverlayContent` and replace the placeholder text for the `help` overlay state with the actual component.

## 5. Screen Integration

*Note: Based on current repository findings, the target issue screens do not exist yet. We will scaffold minimal stubs to satisfy the hook application constraints if necessary, or apply them to the upcoming screen PRs.* 

1. **Create/Update `apps/tui/src/screens/Issues/IssueListScreen.tsx`**
   - Call `useIssueKeyboard` with `subScreen: "list"` and wire up list-specific bindings (`j`, `k`, `Space`, `/`, etc.).

2. **Create/Update `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`**
   - Call `useIssueKeyboard` with `subScreen: "detail"` and wire up detail-specific bindings (`n`, `p`, `c`, `e`, etc.).

3. **Create/Update `apps/tui/src/screens/Issues/IssueCreateForm.tsx` & `IssueEditForm.tsx`**
   - Call `useIssueKeyboard` with form-specific sub-screen configurations (`tab`, `shift+tab`, `ctrl+s`). Hook up dirty state confirmations to `useEscCascade`.

## 6. End-to-End Testing

1. **Create `e2e/tui/issues-keyboard.test.ts`**
   - Establish the test file utilizing `@microsoft/tui-test` and local helpers (`launchTUI`).
   - Replicate the complete matrix of 120 E2E tests grouped in `describe` blocks corresponding to: Status Bar Hints, Help Overlay, List Navigation/Actions, Filters, Detail Navigation/Actions, Forms, Overlays, Priority & Suppression, Go-To Mode, Rapid Input, Context Disambiguation, Responsive Scenarios, and Core Integrations.
   - Implement snapshot assertions (`toMatchSnapshot`) against simulated standard, minimum, and large terminal dimensions.
   - Ensure missing backend capabilities properly map to failing tests without skipping.