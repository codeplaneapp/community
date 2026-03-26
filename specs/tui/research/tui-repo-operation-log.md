# TUI Repo Operation Log: Research Findings

This document outlines the findings from investigating the Codeplane repository to support the implementation of the `tui-repo-operation-log` feature. The search focused on existing scaffolding, patterns, and missing dependencies.

## 1. TUI Application State (`apps/tui/`)

### Screens & Routing
- **Target Scaffold Missing:** The directory `apps/tui/src/screens/Repository/` does not yet exist. A search for `RepoOverviewScreen.tsx` returned zero results in the codebase, although it is heavily referenced in the specifications (e.g., `specs/tui/engineering/tui-repo-screen-scaffold.md`).
- Currently, `apps/tui/src/screens/` only contains `PlaceholderScreen.tsx` and an `Agents` directory. This indicates that the repository tab scaffold (`tui-repo-screen-scaffold`) and tab bar component (`tui-repo-tab-bar-component`) are not yet merged into this branch.

### Hooks (`apps/tui/src/hooks/`)
The foundational hooks required by the engineering spec exist and establish strong patterns for the TUI:
- **`useLayout.ts`:** Centralizes responsive breakpoint calculations. It wraps OpenTUI's `useTerminalDimensions` and returns `{ width, height, breakpoint, contentHeight, sidebarVisible, ... }`. Components should consume this instead of computing dimensions directly.
- **`useTheme.ts`:** Returns a frozen, referentially stable `ThemeTokens` object (e.g., `theme.primary`, `theme.muted`, `theme.success`) resolved from the `ThemeProvider`.
- **`useScreenKeybindings.ts`:** Exists for registering screen-level keybindings and automatically updating the `HelpOverlay` and `StatusBar` hints.
- **`useScreenLoading.ts`:** Exists for handling standardized full-screen loading, retry logic, and spinner frames.
- **`useClipboard.ts`:** Does not exist yet. As mentioned in the spec, it is a "soft" dependency, and the fallback `try/catch` dynamic import strategy proposed in the spec is necessary.

### Components (`apps/tui/src/components/`)
- Contains existing global UI pieces: `AppShell.tsx`, `HeaderBar.tsx`, `StatusBar.tsx`, `SkeletonList.tsx`, and `SkeletonDetail.tsx`.
- The `TabBar.tsx` component is missing, confirming that the tab navigation dependencies need to be stubbed or awaited.

## 2. Data Access Layer

### Shared Core (`packages/ui-core/`)
- **Not Found:** The directory `packages/ui-core/` does not exist in the current monorepo structure. Only `packages/sdk/` and `packages/workflow/` are present.

### TUI Hooks (`apps/tui/src/hooks/data/`)
- The engineering spec requires `useOperationLog()`, `Operation` types, and `parseOperation()` from `tui-repo-jj-hooks`.
- **Not Found:** These files (`useOperationLog.ts`, `jj-types.ts`, `useCursorPagination.ts`) do not currently exist in `apps/tui/src/hooks/` or `apps/tui/src/hooks/data/`.
- **Context from Specs:** A grep search revealed `specs/tui/plans/tui-repo-jj-hooks.md`, which details a plan to create these exact hooks (`useOperationLog()`, `useChanges()`, `useRepoConflicts()`) within `apps/tui/src/hooks/data/` due to the lack of the shared UI core. This confirms the data hooks must either be implemented alongside this ticket or merged prior.

## 3. Web UI Patterns (`apps/ui/src/`)
- **Not Found:** The `apps/ui/` directory does not exist in the workspace. Any references to parity with the web UI must rely entirely on the product requirements documents (PRDs) and the defined TUI specs.

## 4. OpenTUI Context (`context/opentui/`)
- The OpenTUI framework is correctly located in `context/opentui/`.
- The React bindings (`@opentui/react`) expose the required components: `<box>`, `<text>`, `<scrollbox>`, `<input>`, and `<markdown>`.
- It provides foundational hooks like `useTerminalDimensions` which is successfully wrapped by Codeplane's `useLayout` hook.

## 5. Architectural Conclusions

1. **Dependency Stubbing:** Because the parent `RepoOverviewScreen`, the `TabBar`, and the `useOperationLog` hooks are currently absent from the `main` branch state, the implementation of `OperationLogTab` must be highly self-contained.
2. **Fallback Mechanisms:** The `useClipboard` dynamic import fallback defined in the spec is critical, as `tui-clipboard-util` is confirmed missing.
3. **Strict Hook Usage:** The existing hooks (`useTheme`, `useLayout`, `useScreenKeybindings`) enforce a clean separation of concerns. The `OperationLogTab` should strictly avoid inline window-size listener logic and instead rely completely on the `useLayout()` context.
4. **Types and Data:** We will need to scaffold the `OperationResponse` types and potentially mock `useOperationLog` if the target `jj-types` dependency is not injected before implementation begins.