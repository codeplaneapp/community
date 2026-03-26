# Codeplane TUI Research Findings: `tui-issue-detail-view`

## 1. Directory Structure and Precedents (`apps/tui/`)

Upon exploring the `apps/tui/src` structure, the overarching architecture matches the PRD constraints:

- **Hooks**: We found crucial shared layout and interaction hooks in `apps/tui/src/hooks/`:
  - `useScreenKeybindings.ts`: Provides a `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])` hook. This hook maps to `KeybindingContext` with `PRIORITY.SCREEN`. It handles both action keys and status bar hints.
  - `useScreenLoading.ts`: Handles data loading states including early-returns for rapid data, abort signals, and timeout bounds. Exposes `{ showSpinner, showSkeleton, showError, loadingError, retry, spinnerFrame }`.
  - `useTheme.ts`: Returns color tokens (`primary`, `muted`, `success`, `error`, `warning`, `border`, `surface`, etc.).
  - `useLayout.ts`: Yields `{ width, height, contentHeight, breakpoint }`. The `breakpoint` property helps handle the responsive sizes (compact, standard, large).

- **Components**: The standard components available in `apps/tui/src/components/` that the Issue Detail View will depend on include:
  - `SkeletonDetail.tsx`: A readymade placeholder utilizing `useLayout` and `useTheme` to draw a skeleton interface based on provided section arrays (e.g. `sections=["Description", "Comments"]`).
  - `PaginationIndicator.tsx`: Handles loading states for cursor-based infinite scrolling lists.
  - `FullScreenError.tsx` & `FullScreenLoading.tsx`: Standard fallbacks when issues fail to load entirely.
  - *Note:* Sub-components for standard screens (e.g. `TabbedDetailView`) exist, hinting at standard patterns, though Issue Detail specifies a scrollable column structure instead of tabs.

- **Router**: The current `apps/tui/src/screens/` directory contains `Agents/` and `Workflows/` and a `PlaceholderScreen.tsx`. The `Issues/` scaffold seems to be part of the preceding `tui-issues-screen-scaffold` task or will be created entirely in this task.

## 2. Shared Data Hooks and API Types (`@codeplane/ui-core`)

The `@codeplane/ui-core` package, specifically in `packages/ui-core/src/hooks/issues/index.ts` and `packages/ui-core/src/types/issues.ts`, exports the necessary foundational data primitives for the view:

- **Hooks**:
  - `useIssue(owner, repo, number)`
  - `useIssueComments(owner, repo, number)`
  - `useIssueEvents(owner, repo, number)`
  - `useUpdateIssue(owner, repo, number)`
  - `useCreateIssueComment(owner, repo, number)`
  - `useRepoLabels`, `useRepoMilestones`, `useRepoCollaborators` (For managing write actions and picker overlays)

- **Types**:
  - `Issue`: Includes fields `number`, `title`, `body`, `state` (`"open" | "closed"`), `author` (a `{ login: string }`), `assignees`, `labels`, `milestone_id`, `created_at`, `updated_at`, `closed_at`, `comment_count`.
  - `IssueComment`: Includes fields `id`, `commenter`, `body`, `created_at`.
  - `IssueEvent`: Includes fields `id`, `eventType`, `payload`, `createdAt`.

## 3. OpenTUI Primitives (`context/opentui/`)

The target view relies heavily on OpenTUI native primitives mapping to Zig terminal capabilities:

- **`<scrollbox>`**: The fundamental scrolling container mapped to `ScrollBoxRenderable`. Accessible props include `focused`, layout bindings (`paddingX`, `gap`), and it emits `onScroll` events critical for handling pagination (`handleScroll` intersecting 80% of `contentHeight`).
- **`<markdown>`**: Found in `context/opentui/packages/core/src/renderables/Markdown.ts`. Takes a `content` property for the markdown string. This automatically parses standard markdown including tables and code blocks, mapping to `<text>`, `<span>`, and `<code>` primitives behind the scenes. This is how the `issue.body` and `comment.body` will be rendered safely.
- **Layout Components**: Nested flexbox layouts via `<box flexDirection="row|column">` alongside standard layout tokens (`gap`, `paddingX`, `justifyContent`).
- **Text Primitives**: Standard `<text fg={theme.muted}>` with ANSI-fallback support.

## 4. Execution Insights & Implementation Hurdles

1. **Imports & Extensions**: Existing components use ESModule `.js` extensions for imports (e.g., `import { useLayout } from "../hooks/useLayout.js"`). The new implementation files must respect this convention within `apps/tui/src/screens/Issues/`.
2. **`useIssueDependencies`**: As explicitly called out in the specification, this hook does not exist in `@codeplane/ui-core` yet. The component implementation must mock or return empty arrays gracefully, leaving a `TODO` for future adoption without test suite failure.
3. **Event & Comment Normalization**: The timestamps in the data payloads differ slightly (`created_at` in comments vs `createdAt` in events). The `interleaveTimeline` utility must account for this camelCase vs snake_case distinction when creating the unified `sortKey`.
4. **Event Icons Mapping**: OpenTUI expects standard unicode rendering characters. The event icon map outlined in the spec (`+, -, →, ↗, ◆`) will be mapped inside `TimelineEventRow.tsx` via `<text fg={theme.muted}>{icon}</text>`.
5. **Pagination Mechanism**: OpenTUI handles scroll offsets asynchronously. The pagination hook inside `scrollbox.onScroll` requires debouncing or gating behind `timelinePageLoading` boolean states from `useIssueDetail` to prevent duplicate fetches when scrolling aggressively with `j/k` or `G`.