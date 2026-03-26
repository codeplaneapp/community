# Implementation Plan: tui-workspace-screen-scaffold

## 1. Overview & Objectives
This ticket registers three workspace-related screens (`Workspaces`, `WorkspaceDetail`, and `WorkspaceCreate`) in the TUI screen registry and wires up their navigation routes, parameter validation, keybindings, and deep-link support. We will also replace the generic `PlaceholderScreen` usage with dedicated, production-ready stub components using OpenTUI primitives (`<box>`, `<text>`) and hooks (`useScreenKeybindings`).

## 2. Step-by-Step Implementation

### Step 1: Create Route Parameter Validation Utility
**File:** `apps/tui/src/navigation/validateParams.ts`
- **Action:** Create a new pure-function validation module to enforce type safety for route parameters (e.g., UUID format for `workspaceId`).
- **Implementation Details:**
  - Define a `UUID_REGEX` constant.
  - Export `isValidUUID(value: string)` function.
  - Export a `paramValidators` record mapping parameter names to validator functions. Add `workspaceId` which validates using `isValidUUID`.
  - Export `validateParams(params: Record<string, string>)` which iterates over params, calls matching validators, and returns an error string or `null` if valid.

### Step 2: Update NavigationProvider for Parameter Validation
**File:** `apps/tui/src/providers/NavigationProvider.tsx`
- **Action:** Integrate parameter validation into the navigation lifecycle.
- **Implementation Details:**
  - Import `validateParams` from `../navigation/validateParams.js`.
  - In the `push()` and `replace()` methods, before creating a new stack entry, call `validateParams(resolvedParams)`.
  - If validation fails, use `console.warn` to log the navigation block and return early (no-op) so the application does not crash.

### Step 3: Create Workspace Screen Stubs
**Directory:** `apps/tui/src/screens/Workspaces/`
- **Action:** Create distinct placeholder screens that correctly utilize OpenTUI layout primitives and register context-specific keybindings.
- **File:** `WorkspaceListScreen.tsx`
  - Register `c` keybinding for "Create workspace" using `useScreenKeybindings`.
  - Render `<box flexDirection="column">` with title and params dump.
- **File:** `WorkspaceDetailScreen.tsx`
  - Register `s` (suspend) and `r` (resume) keybindings.
  - Render `<box flexDirection="column">` with title and params dump.
- **File:** `WorkspaceCreateScreen.tsx`
  - Register `ctrl+s` (create) and `escape` (cancel/pop) keybindings.
  - Render `<box flexDirection="column">` with title and params dump.
- **File:** `index.ts`
  - Export all three new screen components.

### Step 4: Update Screen Registry
**File:** `apps/tui/src/router/registry.ts`
- **Action:** Update the configuration for the workspace screens to use the new stubs and correct `requiresRepo` flags.
- **Implementation Details:**
  - Import the new stubs from `../screens/Workspaces/index.js`.
  - `ScreenName.Workspaces`: Leave `requiresRepo: false`. Update component to `WorkspaceListScreen`.
  - `ScreenName.WorkspaceDetail`: Change `requiresRepo` to `true`. Update component to `WorkspaceDetailScreen`. Update `breadcrumbLabel` to prefer `workspaceName`, fallback to first 8 chars of `workspaceId`, or default to "Workspace".
  - `ScreenName.WorkspaceCreate`: Change `requiresRepo` to `true`. Update component to `WorkspaceCreateScreen`. Update `breadcrumbLabel` to "New Workspace".

### Step 5: Update Deep-Link Resolution and CLI Arguments
**File:** `apps/tui/src/lib/terminal.ts`
- **Action:** Support a new `--workspace` CLI flag.
- **Implementation Details:** Add `workspace?: string` to `TUILaunchOptions` and parse the `--workspace` flag from `argv`.

**File:** `apps/tui/src/navigation/deepLinks.ts`
- **Action:** Map CLI arguments to workspace parameters and refactor `requiresRepo` validation.
- **Implementation Details:**
  - Refactor the hardcoded `requiresRepo` list to read directly from the screen registry: `const requiresRepo = screenRegistry[screenName]?.requiresRepo ?? false;`.
  - Add deep-link aliases: `"workspace-detail": ScreenName.WorkspaceDetail` and `"workspace-create": ScreenName.WorkspaceCreate`.
  - If `args.workspaceId` is present, inject it into `params.workspaceId` during `buildInitialStack()`.

### Step 6: Update Barrel Exports
**File:** `apps/tui/src/navigation/index.ts`
- **Action:** Export `validateParams`, `isValidUUID`, and `paramValidators`.

**File:** `apps/tui/src/screens/index.ts`
- **Action:** Re-export `WorkspaceListScreen`, `WorkspaceDetailScreen`, and `WorkspaceCreateScreen`.

### Step 7: Create E2E Tests
**File:** `e2e/tui/workspaces.test.ts`
- **Action:** Add robust automated testing utilizing `@microsoft/tui-test` to verify screen registration, parameter validation, go-to mode, deep links, navigation, and rendering snapshots.
- **Implementation Details:**
  - **Registry Tests:** Verify `requiresRepo` flags and `breadcrumbLabel` outputs.
  - **Validation Tests:** Verify valid/invalid UUID logic for `workspaceId`.
  - **Go-to Navigation:** Verify `g w` opens the Workspaces screen.
  - **Deep Links:** Verify `--screen workspaces`, `--screen workspace-detail`, and missing `--repo` fallbacks.
  - **Back Navigation:** Verify `q` (pop) logic returns to expected parent screens.
  - **Snapshot Tests:** Capture screen structure at 80x24, 120x40, and 200x60 breakpoints.
  - **Hint Tests:** Verify context-specific status bar hints (e.g., `c` for create on list screen).

## 3. Acceptance Criteria
- [ ] `validateParams.ts` implemented and properly catches invalid UUIDs, preventing navigation stack pushes.
- [ ] Navigation components correctly render OpenTUI layouts.
- [ ] Registry uses new stubs with `requiresRepo: true` applied to `WorkspaceDetail` and `WorkspaceCreate`.
- [ ] Breadcrumb labels properly derive names/truncated UUIDs for `WorkspaceDetail`.
- [ ] `codeplane tui --screen workspace-detail --repo owner/repo --workspace <uuid>` opens the detailed view.
- [ ] E2E tests in `e2e/tui/workspaces.test.ts` implemented and run against TUI snapshot tooling.