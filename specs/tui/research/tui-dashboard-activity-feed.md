# TUI Dashboard Activity Feed Research Findings

## 1. Current Codebase State

### `apps/tui/` Architecture & Layout
- **Utilities**: Currently, `apps/tui/src/util/` contains text, formatting, and truncation utilities (`text.ts`, `truncate.ts`, `format.ts`). The `relativeTime.ts` file referenced in the spec does not yet exist, confirming it must be created strictly according to the PRD.
- **Dashboard Framework**: Grep searches across the codebase indicate the dashboard ecosystem (`DashboardScreen`, `useDashboardFocus`, `DashboardPanel`) is managed across several feature-branch/PR tickets (`tui-dashboard-screen-scaffold`, `tui-dashboard-grid-layout`, `tui-dashboard-panel-component`). The `DashboardScreen` replaces the `PlaceholderScreen` inside `apps/tui/src/router/registry.ts` and orchestrates panel focus state.
- **Hooks**: Core layout and navigation hooks (`useLayout`, `useTheme`, `useScreenKeybindings`) exist under `apps/tui/src/hooks/` and are actively used by screen components. `useScreenKeybindings` is particularly important for this ticket as it will map keyboard events to the `ActivityFeedPanel` when `focusedPanel === PANEL.ACTIVITY_FEED`.

### `packages/sdk/` Data Contracts
The `@codeplane/sdk` defines the required data structures for the activity feed. Located in `packages/sdk/src/services/user.ts`, we confirmed the `ActivitySummary` interface perfectly aligns with our needs:
```typescript
export interface ActivitySummary {
  id: number;
  event_type: string;
  action: string;
  actor_username: string;
  target_type: string;
  target_name: string;
  summary: string;
  created_at: string;
}
```
This indicates the backend/SDK contract is fully implemented and we simply need to build the frontend `useActivity` hook to consume the `/api/users/:username/activity` endpoint.

### `context/opentui/` Hooks and Primitives
OpenTUI's React reconciler sits in `context/opentui/packages/react`. Important findings:
- **Hooks**: `use-keyboard.ts`, `use-terminal-dimensions.ts`, `use-resize.ts`, and `use-timeline.ts` exist under `packages/react/src/hooks/`. These expose the terminal geometry data crucial for responsive breakpoints (`minimum`, `standard`, `large`).
- **Components**: The OpenTUI native renderer binds generic React tags (`<box>`, `<scrollbox>`, `<text>`, etc.). This matches the spec's usage of `<scrollbox>` for pagination handling and `<box>` flex containers for grid layouts.

## 2. Implementation Approach Validation

Based on the codebase context:
1. **Data Hook Structure**: The plan to implement `packages/ui-core/src/hooks/dashboard/useActivity.ts` using page-based pagination is correct. Since cursor-based pagination is used elsewhere, directly tracking `currentPage`, appending to an `items` array, and utilizing `X-Total-Count` natively from the API response is the right strategy. The API client context (`useAPIClient`) will be used to execute the fetch.
2. **Component Separation**: Separating `ActivityFeedPanel.tsx` from `DashboardScreen.tsx` is required by the grid orchestration pattern. `DashboardScreen` holds the `useDashboardFocus()` state (which panel is focused, where the scroll/cursor is) and passes it down.
3. **Keyboard Routing**: The specification suggests using `useScreenKeybindings` in `DashboardScreen` and utilizing `ref` forwarding to trigger methods (`moveDown`, `filterForward`, etc.) on the child `ActivityFeedPanel`. This aligns perfectly with existing TUI focus management patterns where global scope intercepts the key and routes it to the actively focused panel.
4. **Event Constants**: Mapping `event_type` strings like `repo.create` to standard OpenTUI color tokens (`theme.success`, `theme.primary`) and text symbols (◆, ⑂) in `activityConstants.ts` will gracefully support graceful degradation when scaling down to 80x24 (where symbols are hidden to save column width).