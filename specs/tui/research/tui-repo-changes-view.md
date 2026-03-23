# Research Findings: Codeplane TUI `tui-repo-changes-view`

This document outlines the codebase context discovered to support the implementation of the `tui-repo-changes-view` feature. 

## 1. Directory Structure & Pathing Quirks
- **`@codeplane/ui-core` Path:** The engineering specification mentions adding `useChanges` to `packages/ui-core/`. However, in the current workspace, the `ui-core` package actually resides at **`specs/tui/packages/ui-core/`**. All additions (the hook and the barrel export) must be made here, not at the root.
- **Screen Scaffolding:** The directory `apps/tui/src/screens/Repository/` does not currently exist. The implementation of `ChangesTab` will likely be the first piece of the repository screen scaffold, or the scaffold will be implemented concurrently. 

## 2. API Data & Hooks (`@codeplane/ui-core` & `@codeplane/sdk`)
- **The `Change` Type:** The `Change` interface is already fully defined in **`packages/sdk/src/services/repohost.ts`** and contains the exact fields needed: `change_id`, `commit_id`, `description`, `author_name`, `author_email`, `timestamp`, `has_conflict`, `is_empty`, and `parent_change_ids`.
- **Pagination Primitive:** **`specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`** exposes `usePaginatedQuery<T>`, which fully supports caching via `cacheKey`, fetching via `perPage`, tracking limits via `maxItems`, extracting total counts from the `X-Total-Count` header, and exposing `fetchMore()` and `hasMore`.
- **Hook Template (`useIssues`):** The `useIssues` hook (**`specs/tui/packages/ui-core/src/hooks/issues/useIssues.ts`**) provides the exact template needed for `useChanges`. It extracts `X-Total-Count` from headers and structures the query appropriately.

## 3. TUI Custom Hooks
- **`useLayout` (`apps/tui/src/hooks/useLayout.ts`):** Exposes `{ width, height, contentHeight, breakpoint }`. The `breakpoint` value is a string (`"minimum" | "standard" | "large"` or `null` for unsupported tiny sizes), which exactly aligns with the responsive layout rules required in the spec.
- **`useTheme` (`apps/tui/src/hooks/useTheme.ts`):** Returns a referentially stable object of color tokens (e.g., `theme.muted`, `theme.error`, `theme.primary`, `theme.warning_bg`).
- **`useScreenKeybindings` (`apps/tui/src/hooks/useScreenKeybindings.ts`):** Takes an array of `KeyHandler` objects (`{ key, description, group, handler, when? }`) and optionally an array of status bar hints (`{ keys, label, order }`). Handles scoping and unmounting automatically.

## 4. OpenTUI Components & Props
- Based on **`context/opentui/packages/react/src/types/components.ts`**, the React OpenTUI JSX primitives accept specific props:
  - `<box>`: Yoga flexbox props like `flexDirection`, `flexGrow`, `justifyContent`, `alignItems`, `width`, `height`, `paddingX`, `inverse`, `bg`.
  - `<scrollbox>`: Inherits box props but supports `stickyScroll`.
  - `<text>`: Accepts `fg`, `bg`, `attributes` (bitfield for bold, dim, etc.), `truncate`, `wrapMode`.
  - `<input>`: Accepts `value`, `onChange`, `placeholder`, `focused`, `maxLength`.

## 5. UI Components & Utilities
- **`SkeletonList` (`apps/tui/src/components/SkeletonList.tsx`):** Available to render deterministic loading states. It accepts `columns`, `metaWidth`, and `statusWidth`.
- **`PaginationIndicator` (`apps/tui/src/components/PaginationIndicator.tsx`):** Already built to handle inline pagination feedback at the bottom of lists. Takes `status` (`"idle" | "loading" | "error"`), `spinnerFrame`, and `error` details.
- **Formatting Utilities (`apps/tui/src/util/format.ts`):** Contains `formatAuthConfirmation` and `formatErrorSummary`. We will append the required `formatCompactCount` function to this existing file.
- **`truncateText`:** Already provided in `apps/tui/src/util/text.ts` and `apps/tui/src/util/truncate.ts`.

## 6. Router Registry Missing Route
- **`apps/tui/src/router/registry.ts`:** The `screenRegistry` currently registers `DiffView` and `RepoOverview` but does **not** contain `ChangeDetail`. We will need to register `ScreenName.ChangeDetail` to map to a `PlaceholderScreen` to allow the `Enter` key navigation to succeed without crashing the router.