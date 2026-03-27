# Implementation Plan: TUI_DIFF_SCREEN

This implementation plan details the steps required to complete the `tui-diff-screen` ticket for the Codeplane terminal user interface (TUI). It assumes the foundational scaffolding (`tui-diff-screen-scaffold`) and data hooks (`tui-diff-data-hooks`) either exist or are being built concurrently. The target directory for all TUI code is `apps/tui/src/`, and tests will reside in `e2e/tui/`.

## Step 1: Define Diff Types

**File:** `apps/tui/src/screens/DiffScreen/types.ts`

*   Create the file to hold the complete type model for the Diff screen.
*   Define interfaces: `FileDiffItem`, `LandingComment`, `FocusZone`, `ViewMode`, `DiffScreenParams`, and `CommentFormState`.
*   Implement `validateDiffParams(params)` to ensure safe routing parameters from the ScreenRouter.

## Step 2: Extend CLI Arg Parsing

**File:** `apps/tui/src/lib/terminal.ts`

*   Extend the `TUILaunchOptions` interface to include optional `context` parsing for the DiffScreen route.

## Step 3-9: Component and Integration Implementation

*   Build the DiffScreen component using OpenTUI `<box>` and `<diff>`.
*   Implement unified/split view toggling via the `t` key.
*   Implement sidebar toggling via `Ctrl+B`.
*   Integrate with the global command palette that parses strings like `:diff owner/repo abc123` or `:diff owner/repo !42` and pushes to the `DiffView` via the Navigation context.

## Step 10: E2E Tests Verification

**File:** `e2e/tui/diff.test.ts`

*   Append layout snapshot testing verifying diff views across all terminal constraints (`120x40`, `80x24`, `200x60`). Include snapshots covering unified/split views, empty states, sidebar visibility, change types, chunk collapsible status, and comment overlays.
*   Append keyboard interaction testing covering `j/k` scrolls, focus cycling (`Tab`), sidebar collapsing (`Ctrl+B`), and interaction bindings for comments and mode toggling (`w`, `t`).
*   Append responsive behavior testing to verify terminal resize scenarios gracefully fallback to unified views without crashing.
*   Append data load/edge case testing mimicking network errors and large file constraints. 
*   Ensure that tests expecting unimplemented data backends fail properly as per Codeplane policy.