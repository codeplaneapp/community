# Research Findings: `tui-issue-list-search`

## Overview
This document outlines the current state of the codebase and key findings relevant to implementing the inline search feature for the TUI Issue List (`tui-issue-list-search`). The research investigated the TUI application structure, the `OpenTUI` component library, and the integration points for `@codeplane/ui-core`.

## 1. TUI Application State (`apps/tui/`)
- **Prerequisite Dependencies Missing:** The engineering spec notes dependencies on `tui-issue-list-screen` and `tui-issue-list-filters`. A review of the `apps/tui/src/screens/` directory confirms that the `Issues` folder and associated components do not yet exist.
- **Screen Registry:** The `apps/tui/src/router/registry.ts` currently maps `ScreenName.Issues` and `ScreenName.IssueDetail` to the generic `PlaceholderScreen.tsx`. 
  - **Takeaway:** Implementing `IssueListScreen.tsx` as instructed will require building it as a standalone feature capable of functioning independently of the missing base screen, integrating directly into `registry.ts` to replace `PlaceholderScreen`.
- **Layout & Theming:** The codebase already provides established custom hooks in `apps/tui/src/hooks/`, including `useLayout.js`, `useTheme.js`, and `useNavigation.js`, which are intended to be consumed to properly handle responsive UI changes based on breakpoints (e.g., minimum 80x24 vs standard 120x40).

## 2. OpenTUI Capabilities (`context/opentui/`)
- **React Reconciler Components:** The available OpenTUI components mapped in `context/opentui/packages/react/src/components/index.ts` include `<box>`, `<text>`, `<input>`, `<scrollbox>`, `<code>`, `<diff>`, and multiple text span modifiers (`<b>`, `<i>`, `<span/>`).
- **Input Field Handling:** The `<input>` component in OpenTUI inherently handles basic key events (Printable characters, Backspace). The spec relies heavily on this, but custom keybindings (`Ctrl+U` and `Ctrl+W`) may need explicit mapping via custom logic or `useScreenKeybindings` depending on OpenTUI's built-in support.
- **Color Baseline:** All colors should be mapped to the TUI's internal ANSI theme tokens (e.g., `theme.primary` for search highlights, `theme.muted` for timestamps) leveraging `useTheme()`.

## 3. Data Flow & `@codeplane/ui-core` Integration
- **Current Location of UI-Core:** The actual `packages/ui-core` module is not actively installed at the monorepo root. However, extensive specification files (like `specs/tui/packages/ui-core/src/hooks/issues/useIssues.ts`) outline its API contract. 
- **useIssues Pattern:** The `useIssues` hook follows a `usePaginatedQuery` standard, expecting parameters such as `(owner, repo, { state, per_page })` and returning `{ issues, totalCount, isLoading, fetchMore, refetch }`. 
- **Server-Side Search Fetching:** The spec relies heavily on `useAPIClient()` to access the base HTTP client for debounced GET requests to `/api/repos/:owner/:repo/issues?q={query}`. The context provider `APIClientProvider` inside `apps/tui/src/providers/` will be responsible for supplying `useAPIClient()`.
- **Missing Types:** Any TS types needed for `Issue` can be explicitly assumed to be provided by `@codeplane/ui-core` as `import type { Issue } from "@codeplane/ui-core";`.

## 4. Architectural Patterns to Follow
- **Telemetry:** Must be wired using the existing `emit()` function located in `apps/tui/src/lib/telemetry.ts`.
- **Logging:** All status events and potential search network errors must use the internal logger located at `apps/tui/src/lib/logger.ts`.
- **E2E Testing:** Tests must go in `e2e/tui/` using `@microsoft/tui-test`. `e2e/tui/helpers.ts` provides the `launchTUI()` function necessary to initialize snapshot and keyboard interaction tests. Failing integrations with missing backend routes or missing base screens should be written but left failing as living documentation, enforcing the mandate not to use `.skip()`.