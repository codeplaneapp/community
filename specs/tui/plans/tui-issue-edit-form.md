# Implementation Plan: TUI Issue Edit Form

## Phase 1: Core State & Logic Hooks

1. **Create `apps/tui/src/screens/Issues/hooks/useDirtyTracking.ts`**
   - Implement the `useDirtyTracking` hook.
   - Leverage `useMemo` to compare current state values against an initial snapshot, identifying modified fields.
   - Implement a `sortedJoin` utility for order-agnostic array comparisons (useful for labels and assignees).
   - Expose the boolean `isDirty`, a `dirtyFields` Set, and a `buildPatch()` method returning only the delta fields.

2. **Create `apps/tui/src/screens/Issues/hooks/useIssueEditForm.ts`**
   - Import and consume data hooks from `@codeplane/ui-core`: `useIssue`, `useUpdateIssue`, `useRepoLabels`, `useRepoMilestones`, and `useRepoCollaborators`.
   - Establish React state for form fields: `title`, `body`, `labelNames`, `assigneeLogins`, and `milestoneId`.
   - Implement form orchestration logic: focus cycling (`focusNext`, `focusPrev` modulo `FIELD_COUNT`) and overlay visibility management.
   - Add validation logic (e.g., non-empty title) and a 300ms debounce for the collaborator search query.
   - Implement the `submit()` function ensuring only the delta PATCH built by `useDirtyTracking` is sent, followed by cache refetching and screen popping on success.

3. **Create `apps/tui/src/screens/Issues/hooks/index.ts`**
   - Export `useDirtyTracking`, `useIssueEditForm`, `EditFormField`, and type definitions.

## Phase 2: Form Sub-Components

4. **Create `apps/tui/src/screens/Issues/components/MetadataSelectOverlay.tsx`**
   - Build a reusable centered `<box>` with a primary border to act as a modal.
   - Register a localized `PRIORITY.MODAL` keybinding scope catching `Esc`, `Enter`, `Space`, `j`, and `k` to trap interactions within the overlay.
   - Use the OpenTUI `<select>` component for rendering. Since OpenTUI's `<select>` handles single-selection natively, maintain a localized `Set<string>` in this component to support manual multi-select behaviors. Prepend selected options with a "✓" checkmark.
   - Introduce an optional internal `<input>` dynamically mapped to `searchQuery` if `searchable` is enabled (for assignee search filtering).

5. **Create `apps/tui/src/screens/Issues/components/DiscardConfirmDialog.tsx`**
   - Create a small centered modal explicitly requesting `[y/N]` confirmation.
   - Register a `PRIORITY.MODAL` scope listening precisely to `y` (confirm discard), and `n` or `Esc` (cancel discard).

6. **Create `apps/tui/src/screens/Issues/components/index.ts`**
   - Export `MetadataSelectOverlay` and `DiscardConfirmDialog`.

## Phase 3: Main Screen & Router Integration

7. **Create `apps/tui/src/screens/Issues/IssueEditForm.tsx`**
   - Initialize `useIssueEditForm` extracting `owner`, `repo`, and `number` from `ScreenComponentProps.params`.
   - Setup form-level keybindings via `useScreenKeybindings` (under `PRIORITY.SCREEN`) handling `Tab`, `Shift+Tab`, `Ctrl+S`, `Enter`, and `Escape`.
   - Assemble the UI utilizing OpenTUI's primitives (`<input>`, `<textarea>`, `<box>`, `<text>`).
   - Structure fields conditionally showing `▸` markers and border colors based on the `focusedField` state.
   - Conditionally render `MetadataSelectOverlay` variants (Labels, Assignees, Milestone) or `DiscardConfirmDialog` based on hook state.
   - Handle varying dimensions efficiently (`minimum`, `standard`, `large` via `useLayout()`) to truncate texts dynamically.

8. **Create `apps/tui/src/screens/Issues/index.ts`**
   - Export `IssueEditForm`.

9. **Update `apps/tui/src/router/registry.ts`**
   - Import `IssueEditForm` from `../screens/Issues/index.js`.
   - Update the configuration for `ScreenName.IssueEdit`, replacing `PlaceholderScreen` with `IssueEditForm`.

## Phase 4: Verification & E2E Testing

10. **Create `e2e/tui/issues.test.ts`**
    - Initialize testing via `@microsoft/tui-test` and `launchTUI()`.
    - **Snapshot Tests**: Assert structural rendering across 80x24, 120x40, and 200x60 dimensions, validating input fields, focus highlights, and pre-population.
    - **Interaction Tests**: Simulate keyboard workflows (`Tab` navigation loops, `Space` multi-select toggles inside overlays, `Esc` discard prompts, and `Ctrl+S` submission executions).
    - **Error Handling Tests**: Mock failures confirming appropriate banners (e.g., 401 Session expired, 403 Permission denied, 409 Conflict with R-reload hint, and title validation failures).
    - Ensure no tests are skipped; tests failing legitimately from lacking backend stubs should stay mapped to actual product behavior.