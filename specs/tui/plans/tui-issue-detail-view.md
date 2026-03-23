# Implementation Plan: TUI Issue Detail View

**Ticket**: `tui-issue-detail-view`
**Status**: Planned

This plan details the implementation of the full-screen issue detail view for the Codeplane TUI. It strictly adheres to the engineering specifications, uses React 19 with OpenTUI components, and handles edge cases found in research, such as ESModule `.js` extension requirements and mismatched API timestamp keys.

---

## Step 1: Define Types and Constants
**File**: `apps/tui/src/screens/Issues/types.ts`

Extend the screen-local types file to support the detail view. Define timeline variants, ensuring we account for `@codeplane/ui-core` API responses.

1. Define `TimelineCommentItem` and `TimelineEventItem`.
2. Define a discriminated union `TimelineItem`.
3. Add rendering constants (`MAX_BODY_LENGTH = 100_000`, `MAX_TIMELINE_ITEMS = 500`, etc.).
4. Add `CommentDraft` and `MetadataState` interfaces for component local state.

---

## Step 2: Core Utilities
**File**: `apps/tui/src/screens/Issues/utils/interleave-timeline.ts`
**File**: `apps/tui/src/screens/Issues/utils/relative-time.ts`
**File**: `apps/tui/src/screens/Issues/utils/truncate.ts`
**File**: `apps/tui/src/screens/Issues/utils/index.ts`

1. **Timeline Interleaving**: Merge `IssueComment[]` and `IssueEvent[]`. 
   *Crucial Implementation Detail*: Map `c.created_at` (comments) and `e.createdAt` (events) to a unified `sortKey` string for proper chronological sorting.
2. **Relative Time Format**: Implement `relativeTime(iso: string, format: TimestampFormat)` supporting `compact`, `standard`, and `full`.
3. **Truncation**: Implement `truncateBody`, `truncateCommentBody`, `truncateLabelName`, and `truncateUsername`. Import core string utils using `.js` extensions: `import { truncateRight } from "../../../util/text.js";`
4. Export all via `index.ts` (using `.js` exports).

---

## Step 3: Issue Detail Sub-Components
Create modular UI components inside `apps/tui/src/screens/Issues/components/`. *Note: Ensure all local imports use `.js` extensions.* 

1. **`IssueHeader.tsx`**:
   - Receives `Issue`.
   - Renders `<box flexDirection="column">` with the issue title, state badge (`[open]`/`[closed]`), and author/timing metadata using `relativeTime`.
2. **`IssueMetadata.tsx`**:
   - Receives `Issue`, `milestoneName`, and `metadataState`.
   - Handles responsive collapsing at compact breakpoints (`width < 120`). Shows `m:metadata` hint when collapsed.
3. **`CommentBlock.tsx`**:
   - Renders a single `<box>` containing an author header and `<markdown content={bodyText} />`.
   - Highlights the left border if `focused` is true.
4. **`TimelineEventRow.tsx`**:
   - Maps `eventType` to symbols (`+, -, →, ↗, ◆`). Renders a single-line description of the event.
5. **`IssueDependencies.tsx`**:
   - Receives dependencies/dependents. Maps over them with `Depends on #N` or `Blocks #N`.
6. **`CommentInput.tsx`**:
   - When `draft.isOpen` is true, renders an `<input multiline height={5} />` for new comments.
7. **`index.ts`**: Barrel export for all components.

---

## Step 4: Orchestration Hook (`useIssueDetail`)
**File**: `apps/tui/src/screens/Issues/hooks/useIssueDetail.ts`

1. Import `@codeplane/ui-core` hooks: `useIssue`, `useIssueComments`, `useIssueEvents`, `useUpdateIssue`, `useCreateIssueComment`.
2. Stub `dependencies` state with `useEffect` to return empty arrays gracefully, leaving a `TODO: Replace with useIssueDependencies when backend implements the endpoint` to ensure tests aren't blocked.
3. Wrap timeline interleaving in `useMemo`.
4. Expose paginated fetch functions and loading states. Ensure `fetchMoreTimeline` checks `!timelinePageLoading` to prevent OpenTUI `<scrollbox>` rapid-scroll double fetches.
5. Wire `logger.info` and `logger.error` for component telemetry.

---

## Step 5: Main Screen Component (`IssueDetailScreen`)
**File**: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`

1. **Imports**: Use OpenTUI specific hooks (`useLayout.js`, `useTheme.js`, `useScreenKeybindings.js`, `useScreenLoading.js`) and components (`<scrollbox>`, `<markdown>`, `<box>`, `<text>`).
2. **Data & State**: Initialize `useIssueDetail`, `useState` for comment draft, metadata state, and focused comment indices.
3. **Pagination Handling**: Implement `handleScroll` to check `(scrollY + viewportHeight) / contentHeight >= 0.8`. Gate with `detail.timelinePageLoading`.
4. **Keybindings Context**: Map `j/k/n/p` navigation, `c` (comment), `e` (edit), `o` (toggle state), `m` (metadata toggle), `q` (back).
5. **Rendering**: 
   - Handle `showSpinner` and `showError` via `useScreenLoading`.
   - Render `<IssueHeader>`, `<IssueMetadata>`, a separator `<text>`, and a `<scrollbox>` containing the body, `<IssueDependencies>`, `<CommentBlock>` list, and `<TimelineEventRow>` list.
   - Mount `<CommentInput>` at the bottom if `draft.isOpen`.

---

## Step 6: Route Registration
**File**: `apps/tui/src/router/registry.ts`

1. Import `IssueDetailScreen`.
2. Replace the `PlaceholderScreen` mapped to `ScreenName.IssueDetail` with the `IssueDetailScreen` component.

---

## Step 7: Testing Strategy

**1. Unit Tests (`apps/tui/src/screens/Issues/utils/__tests__/`)**:
- Create `interleave-timeline.test.ts` to verify `createdAt` / `created_at` normalization and `MAX_TIMELINE_ITEMS` cap.
- Create `relative-time.test.ts` and `truncate.test.ts` for edge cases.

**2. E2E Tests (`e2e/tui/issues.test.ts`)**:
Append a `describe("Issue Detail View", ...)` block to the existing test file utilizing `@microsoft/tui-test`.
- **Snapshots**: Test rendering at `120x40` (standard), `80x24` (compact), and `200x60` (large). Verify open/closed state badges and markdown rendering.
- **Interactions**: Test `j/k` scrolling, `n/p` comment jumps, `c` opening the comment box, `Esc` cancelling, and `q` popping the navigation stack.
- **Data edge cases**: Verify 404 views and empty state (no comments/description).
- *Requirement*: If a test fails because the event endpoint returns a 404 (since the backend isn't ready), leave the test failing to signal missing backend parity.