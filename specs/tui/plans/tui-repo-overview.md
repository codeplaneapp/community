# Implementation Plan: TUI Repository Overview Screen

## 1. Create Utility Functions
**File:** `apps/tui/src/util/repo.ts`
- Implement `formatCount(n: number): string` to format numbers with K/M abbreviations safely.
- Implement `relativeTime(iso: string): string` to format ISO timestamps into compact relative strings (e.g., "3s", "2h", "1mo").
- Implement `isValidRepoSegment(segment: string): boolean` to validate repository owner/name segments against allowed characters.
- Implement `parseRepoFullName(fullName: string): { owner: string; repo: string } | null` to parse "owner/name" strings.

## 2. Define Repository Types
**File:** `apps/tui/src/types/repository.ts`
- Define the `Repository` interface detailing the properties expected within the TUI (e.g., `id`, `fullName`, `isPublic`, `numStars`).
- Implement `parseRepository(raw: Record<string, unknown>): Repository` to map raw snake_case API responses to the camelCase `Repository` interface, handling missing fields gracefully with defaults.

## 3. Create TUI Data Hook Adapters
Create TUI-local adapters for data fetching in `apps/tui/src/hooks/` (until `@codeplane/ui-core` hooks are ready):
- **File:** `apps/tui/src/hooks/useRepo.ts`: Fetches `GET /api/repos/:owner/:repo`. Returns `{ repo, isLoading, error, refetch }`.
- **File:** `apps/tui/src/hooks/useRepoReadme.ts`: Fetches `GET /api/repos/:owner/:repo/readme`. Returns `{ content, isLoading, error }` (handles 404s gracefully by setting content to `null`).
- **File:** `apps/tui/src/hooks/useStarRepo.ts`: Checks star status on mount `GET /api/user/starred/:owner/:repo` and provides a `toggle` function utilizing `PUT`/`DELETE` for starring/unstarring.
- **File:** `apps/tui/src/hooks/useClipboard.ts`: Provides a `copy(text: string)` function utilizing OSC 52 terminal clipboard escape sequences (`\x1b]52;c;...`) and sets `supported` flag.

## 4. Build the Repository Overview Component
**File:** `apps/tui/src/screens/RepoOverviewScreen.tsx`
- Create `RepoOverviewScreen` component using React and OpenTUI primitives (`<scrollbox>`, `<box>`, `<text>`, `<markdown>`).
- Implement data fetching utilizing the local hooks (`useRepo`, `useRepoReadme`, `useStarRepo`, `useClipboard`).
- Integrate `useScreenLoading` for handling screen loading cycles and rendering `<FullScreenLoading>` or `<FullScreenError>` on failure.
- Implement state and optimistic UI updates for the star toggle action, ensuring rollback on failure.
- Implement terminal status messages for clipboard copy and star success/failure.
- Map screen keybindings via `useScreenKeybindings`:
  - `s` (star/unstar), `c` (copy clone URL), `b` (bookmarks), `i` (issues), `l` (landings), `f` (workflows), `k` (wiki), `e` (code explorer), `R` (retry).
- Address responsive layouts using `useResponsiveValue` for label alignment and stacked vs. row-based stats depending on terminal width.
- Implement telemetry tracking (`tui.repo.overview.view`, `tui.repo.overview.star`, etc.) and structured logging.
- Include local sub-components: `MetadataRow`, `StatsRow`, `ForkIndicator`.

## 5. Register the Screen in the Router
**File:** `apps/tui/src/router/registry.ts`
- Replace `PlaceholderScreen` for the `ScreenName.RepoOverview` entry with the newly created `RepoOverviewScreen`.

## 6. Update Barrel Exports
Export newly added types, hooks, and utilities:
- **File:** `apps/tui/src/util/index.ts`: Add `export * from "./repo.js";`
- **File:** `apps/tui/src/types/index.ts`: Add `export * from "./repository.js";`
- **File:** `apps/tui/src/hooks/index.ts`: Add exports for `useRepo`, `useRepoReadme`, `useStarRepo`, `useClipboard`.

## 7. Write Unit Tests
**File:** `e2e/tui/util-repo.test.ts`
- Write pure function unit tests for `formatCount`, `relativeTime`, `parseRepoFullName`, and `isValidRepoSegment` to assert logic against varying formats and edges.
- Write unit tests for `parseRepository` confirming robust snake_case to camelCase conversions, including scenarios with missing fields or nested null structures.

## 8. Write Integration and E2E Tests
**File:** `e2e/tui/repository.test.ts`
- **Terminal Snapshots:** Implement tests spanning `SNAP-REPO-OVERVIEW-001` through `021` using `@microsoft/tui-test`, verifying the initial load, varying data permutations (archived, private, fork, starred, missing descriptions/topics/readme), loading states, and error states.
- **Keyboard Interactions:** Implement tests `KEY-REPO-OVERVIEW-001` through `028` verifying `<scrollbox>` interaction (j/k, Ctrl+D/U, G, g g), executing keybindings (`s`, `c`, `b`, `i`, `l`, `f`, `e`, `Tab`, `R`, `?`), confirming state updates and breadcrumb transitions.
- **Responsive Behavior:** Implement tests `RSP-REPO-OVERVIEW-001` through `010` to simulate sizing up and down between `80x24`, `120x40`, and `200x60` and verify correct data truncation/wrapping and `<scrollbox>` position preservation.
- **Integration Testing:** Implement tests `INT-REPO-OVERVIEW-001` through `010` verifying system behavior against API failures (401 auth, 429 rate limit, 500 server error, timeout disconnects) and deep link routing capabilities.