# Implementation Plan: tui-issue-labels-display

This document outlines the step-by-step implementation plan for the `tui-issue-labels-display` feature. Since our research indicates that prerequisites like `LabelBadge` and the core `Issues` screens do not yet exist in the codebase, this plan includes scaffolding those dependencies alongside implementing the label picking, filtering, and mutation logic as required by the specification.

## 1. Scaffold Missing Primitives

Before implementing the cross-cutting label display, we must establish the foundational visual components for labels.

### 1.1 Create `LabelBadge` Components
**Target:** `apps/tui/src/components/LabelBadge.tsx`
- Create `LabelBadge` using OpenTUI's `<box>` and `<text>` primitives to render a colored bullet `●` and truncated text.
- Create `LabelBadgeList` to render a responsive list of `LabelBadge`s, handling overflow with a `+N` indicator.
- Consume `NO_COLOR` environment variable and `@codeplane/ui-core` color resolution utilities to handle terminal color fallbacks.

## 2. Implement Core Hooks

### 2.1 Create `useLabelPicker`
**Target:** `apps/tui/src/hooks/useLabelPicker.ts`
- Build the shared state machine for picker UI logic.
- **State:** `filteredLabels`, `focusedIndex`, `selectedIds`, `searchQuery`.
- **Keyboard Integration:** Use `KeybindingContext` from `apps/tui/src/providers/KeybindingProvider.js` and `normalizeKeyDescriptor`. Register a `PRIORITY.MODAL` scope when `isOpen` is true.
- **Search:** Implement fuzzy search across label names, falling back to basic substring match if `@codeplane/ui-core/commands` `fuzzySearch` is not yet available.
- **Pagination & Navigation:** Handle `j/k` (Down/Up), `Ctrl+D/U` (Page Down/Up), `g g` (jump to first via timer ref), and `G` (jump to last).
- **Selection:** Handle `Space` toggling up to `maxSelectable`.

### 2.2 Create `useLabelMutations`
**Target:** `apps/tui/src/hooks/useLabelMutations.ts`
- Wrap `@codeplane/ui-core`'s `useAddIssueLabels` and `useRemoveIssueLabel` hooks.
- **Logic:** Compute `labelsToAdd` and `labelsToRemove` based on `selectedIds` vs `currentLabels`.
- **Optimistic UI:** Immediately call `onLabelsChange` with the new target state. If the `Promise.all` mutation fails, catch the error, revert to the initial state, log it, and trigger a failure notification.
- **Telemetry:** Emit `tui.labels.picker_applied`, `tui.labels.add_error`, and `tui.labels.remove_error`.

## 3. Implement Modal Overlays

### 3.1 Create `LabelPickerOverlay`
**Target:** `apps/tui/src/components/LabelPickerOverlay.tsx`
- Implement the mutation-oriented overlay using OpenTUI `<box position="absolute">`.
- Consume `useTheme` and `useLayout` (`layout.modalWidth`, `layout.modalHeight`).
- Consume `useLabelPicker` initialized with `maxSelectable: 10`.
- Render loading states (`useSpinner()`) and handle fetch errors with retry hints.

### 3.2 Create `LabelFilterOverlay`
**Target:** `apps/tui/src/components/LabelFilterOverlay.tsx`
- Implement the client-side filtering overlay.
- Consume `useLabelPicker` initialized with `maxSelectable: 0` (unlimited).
- Adjust footer text for `AND logic` and suppress mutation telemetry in favor of `tui.labels.filter_*` events.

## 4. Scaffold Screens & Integrate Labels

Since the issue screens currently do not exist, we will scaffold them and inject the label feature.

### 4.1 Create & Integrate `IssueListScreen`
**Target:** `apps/tui/src/screens/Issues/IssueListScreen.tsx`
- Scaffold the issue list view consuming `@codeplane/ui-core`'s `useIssues()`.
- Integrate `LabelBadgeList` into the row layout. Use `useResponsiveValue` to dynamically hide or resize the label column.
- Implement `filterLabelIds` state. Filter the `issues` array using an AND-logic reducer before passing it to the list rendering loop.
- Add the `L` keybinding in `useScreenKeybindings` to open the `LabelFilterOverlay`.

### 4.2 Create & Integrate `IssueDetailScreen`
**Target:** `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`
- Scaffold the issue detail view fetching a single issue.
- Render the `LabelBadge` array in a flex-wrap box beneath the issue title/author.
- Integrate `useLabelMutations` for optimistic updates.
- Add the `l` keybinding (checking `hasWriteAccess` first) to open the `LabelPickerOverlay`.

### 4.3 Create & Integrate Create/Edit Forms
**Targets:** 
- `apps/tui/src/screens/Issues/IssueCreateForm.tsx`
- `apps/tui/src/screens/Issues/IssueEditForm.tsx`
- Scaffold basic form boxes with title/body inputs.
- Add a "Labels" section displaying currently selected badges.
- Map `Enter` on the label field to open `LabelPickerOverlay` (using the overlay solely to build `selectedLabelIds` state without triggering API mutations directly).

## 5. Exports and Application Wiring

### 5.1 Barrel Exports
**Targets:**
- `apps/tui/src/components/index.ts`: Export `LabelBadge`, `LabelBadgeList`, `LabelPickerOverlay`, `LabelFilterOverlay`.
- `apps/tui/src/hooks/index.ts`: Export `useLabelPicker`, `useLabelMutations`.
- `apps/tui/src/screens/index.ts` (if applicable): Export the new Issue screens.

## 6. End-to-End Testing

### 6.1 Create Test Suite
**Target:** `e2e/tui/issues.test.ts`
- Set up the test file importing `@microsoft/tui-test` bindings via `e2e/tui/helpers.ts`.
- Transcribe all 84 E2E tests exactly as mapped in the specification, divided into the following blocks:
  - `TUI_ISSUE_LABELS_DISPLAY — Snapshots` (22 tests)
  - `TUI_ISSUE_LABELS_DISPLAY — Keyboard` (20 tests)
  - `TUI_ISSUE_LABELS_DISPLAY — Responsive` (12 tests)
  - `TUI_ISSUE_LABELS_DISPLAY — Integration` (16 tests)
  - `TUI_ISSUE_LABELS_DISPLAY — Edge Cases` (14 tests)
- Leave tests failing where backend implementations (e.g., 500 error injection, rate limiting mock) are not yet implemented in the testing harness.

## 7. Operational Review & Productionization

- **Error Boundaries:** Ensure `LabelPickerOverlay` propagates fatal errors up to the global `<ErrorBoundary>`.
- **Performance:** Verify `<scrollbox>` correctly clips unrendered list items inside the picker overlay when displaying 100+ labels.
- **Logging:** Verify `logger.info` and `logger.warn` are emitting cleanly per the event schema specified.
- **Sync/Async Execution:** Confirm `useOnResize` gracefully repaints without breaking overlay layout metrics.