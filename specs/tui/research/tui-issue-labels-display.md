# Research Findings for `tui-issue-labels-display`

Based on a comprehensive search across the Codeplane workspace, here is the context relevant to implementing the `tui-issue-labels-display` specification:

## 1. Missing Implementations (Prerequisites or Scope of Ticket)
- **Components**: The `LabelBadge` and `LabelBadgeList` components (supposed to be in `tui-label-badge-component` or `apps/tui/src/components/LabelBadge.js`) do not currently exist in the repository.
- **Screens**: None of the issue-related screens (`IssueListScreen`, `IssueDetailScreen`, `IssueCreateForm`, `IssueEditForm`) exist yet within `apps/tui/src/screens/`. The `screens` directory currently only contains a `PlaceholderScreen.tsx` for `Agents`.

## 2. Shared Data Hooks (`@codeplane/ui-core`)
The API hooks are scaffolded within the workspace (located at `specs/tui/packages/ui-core/src/hooks/issues/`). These match the required APIs perfectly:

- **`useRepoLabels(owner, repo, options)`**: Uses `usePaginatedQuery` internally and returns `{ labels, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.
- **`useAddIssueLabels(owner, repo)`**: Returns `{ mutate, isLoading, error }`. The `mutate` function expects an object `{ issueNumber: number, labelNames: string[] }`.
- **`useRemoveIssueLabel(owner, repo, callbacks)`**: Accepts optimistic update callbacks (`onOptimistic`, `onRevert`, `onError`, `onSettled`). The `mutate` function expects `{ issueNumber: number, labelName: string }`.

## 3. Keyboard & Event Infrastructure
The TUI application provides a robust priority-based keybinding system located in `apps/tui/src/providers/`:
- **`KeybindingProvider`**: Exposes `KeybindingContext` with methods `registerScope(scope)` and `removeScope(id)`.
- **`PRIORITY`**: Exposes priority constants in `keybinding-types.ts`, specifically `PRIORITY.MODAL` which is required for the `useLabelPicker` hook.
- **`normalizeKeyDescriptor` / `normalizeKeyEvent`**: Available in `normalize-key.ts` to convert raw keyboard events to reliable descriptor strings for checking key inputs.

## 4. Overlay System
The modal overlay framework (`tui-modal-component`) exists and is ready for integration:
- **`OverlayLayer.tsx`** (`apps/tui/src/components/OverlayLayer.tsx`): Responsible for rendering an absolute `<box>` dynamically sizing to `layout.modalWidth` and `layout.modalHeight`. It looks at `activeOverlay` to render the correct UI.
- **`useOverlay.ts`** (`apps/tui/src/hooks/useOverlay.ts`): Provides `activeOverlay`, `closeOverlay`, `openOverlay`, and `confirmPayload` from `OverlayContext`.

## 5. Responsive & Theming Utilities
`apps/tui/src/hooks/` contains several helpful utilities for building the overlay and list components:
- `useLayout.ts`: For breakpoint-aware dimensions (`layout.modalWidth`, `layout.modalHeight`, `layout.breakpoint`).
- `useResponsiveValue.ts`: For resolving values based on terminal width (`minimum`, `standard`, `large`).
- `useTheme.ts`: For standardized semantic colors (`theme.primary`, `theme.surface`, `theme.muted`, `theme.success`, `theme.error`, `theme.border`).
- `useSpinner.ts`: For rendering terminal-based loading spinners.

## Summary
All the underlying state, theming, keyboard prioritization, and overlay systems are in place. The core API hooks needed for the `useLabelMutations` wrapper are also present. The actual label rendering components (`LabelBadge`, `LabelBadgeList`) and the screens to integrate them with (`IssueListScreen`, `IssueDetailScreen`, etc.) must either be scaffolded as part of this ticket or depend on another PR/ticket to be merged first.