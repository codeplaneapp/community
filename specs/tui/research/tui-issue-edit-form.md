# Research Findings: `tui-issue-edit-form`

## 1. Directory & Scaffold State (`apps/tui/`)
- **Screens Directory**: As correctly indicated in the specification, the `apps/tui/src/screens/Issues/` directory does not currently exist. The only screen directories present are `Agents` along with a `PlaceholderScreen.tsx` stub.
- **Screen Registry**: Checked `apps/tui/src/router/registry.ts`. `ScreenName.IssueEdit` is correctly registered and currently maps to `PlaceholderScreen`.
  - The router passes `{ entry, params }` to the component, where `params.owner`, `params.repo`, and `params.number` can be extracted to obtain the necessary context for fetching the issue.

## 2. API Data Hooks (`packages/ui-core`)
The `ui-core` package hooks are actually located in the monorepo under `specs/tui/packages/ui-core/src/hooks/issues/`.
- **`useIssue(owner, repo, issueNumber)`**: Implemented using a 30-second `lastFetchTimestamp` cache. It returns `{ issue, isLoading, error, refetch }`. A successful issue edit will require calling `refetch()` before or simultaneously with popping the screen to force a refresh, as updating bypasses the cache using `refetchCounter`.
- **`useUpdateIssue(owner, repo, callbacks)`**: Accepts `UpdateIssueCallbacks` and returns a `mutate(issueNumber, patch)` method. The inner implementation explicitly maps `title`, `body`, `state`, `assignees`, `labels`, and `milestone` from the incoming patch request and passes it via `PATCH /api/repos/{owner}/{repo}/issues/{issueNumber}`.
- **Metadata Listing Hooks**: 
  - `useRepoLabels` and `useRepoMilestones` use `usePaginatedQuery` and return paginated results (`items`, `totalCount`, `isLoading`, etc.).
  - `useRepoCollaborators` is a search endpoint wrapper hitting `/api/search/users?q={query}`. It natively handles skipping queries if the search query is empty, meaning the TUI assignee overlay *must* provide a search input as per the specs.

## 3. Data Types (`types/issues.ts`)
- **`Issue`**: Contains all necessary fields that need pre-population: `title` (string), `body` (string), `assignees` (array of `{ id, login }`), `labels` (array of `{ id, name, color, description }`), and `milestone_id` (number or null).
- **`UpdateIssueRequest`**: Only accepts delta properties. `assignees` expects an array of strings (logins), `labels` expects an array of strings (names), and `milestone` expects a number or `null`.

## 4. OpenTUI Renderables (`context/opentui/packages/core/src/renderables/`)
- **`Select.ts`**: The underlying `<select>` component for the proposed `MetadataSelectOverlay` is robust but specifically implements a single-selection navigation pattern (`selectedIndex`). It lacks an explicit `multiSelect` mode or an array state tracking selected items. To support multiple selections, the custom `MetadataSelectOverlay` must trap the `Space` key binding, toggle a localized `Set<string>`, and dynamically prefix selected elements visually (e.g. `"▶ "` or `"✓"`) rather than relying on OpenTUI's `Select` to hold those values natively.
- **`Textarea.ts` & `Input.ts`**: Standard primitives are available for use by the edit form.

## 5. Providers & Keybindings
- **Overlays**: `apps/tui/src/providers/OverlayManager.tsx` handles global confirm overlays. The spec correctly identifies that a form-local overlay approach for `MetadataSelectOverlay` and `DiscardConfirmDialog` using `PRIORITY.MODAL` is needed to block main-form key handling (`PRIORITY.SCREEN`) without bleeding out to the global app overlay stack.
- **`useScreenKeybindings`**: Available in `apps/tui/src/hooks/useScreenKeybindings.ts` and will successfully isolate key commands like `Ctrl+S`, `Tab`, and `Escape` under `PRIORITY.SCREEN`.

## Implementation Readiness
The underlying foundation (API client, UI-core hooks, OpenTUI inputs/boxes, and screen routing) is complete. The absence of `apps/tui/src/screens/Issues/` and specific shared form system utilities means the form orchestration, layout calculations, and focus cycling logic must be built locally to the new IssueEditForm directory as outlined by the technical spec.