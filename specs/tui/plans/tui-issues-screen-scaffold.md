# Implementation Plan: tui-issues-screen-scaffold

This document outlines the step-by-step implementation plan to scaffold the Issues screen surface area in the Codeplane TUI. This includes creating the necessary directory structures, placeholder screen components, wiring the screen registry, verifying go-to keybindings, and setting up the E2E test harness.

## Step 1: Create Issues Screen Directory & Types

**File:** `apps/tui/src/screens/Issues/types.ts`

Create the directory `apps/tui/src/screens/Issues/` and add the `types.ts` file to define screen-local type aliases that re-export from `@codeplane/ui-core` for convenience.

```typescript
import type { ScreenComponentProps } from "../../router/types.js";

// Re-export for convenience within this screen module
export type { ScreenComponentProps };

// Issue list filter state used by IssueListScreen (will be extended in tui-issue-list-screen ticket)
export type IssueFilterState = "open" | "closed" | "";
```

## Step 2: Implement `IssueListScreen` Placeholder

**File:** `apps/tui/src/screens/Issues/IssueListScreen.tsx`

Create the placeholder for the issue list screen. It will extract repository context from params, register basic screen keybindings via `useScreenKeybindings()`, and render a loading state.

```typescript
import { useCallback } from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { ScreenName } from "../../router/types.js";
import { useNavigation } from "../../providers/NavigationProvider.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function IssueListScreen({ entry, params }: ScreenComponentProps) {
  const nav = useNavigation();
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";

  const handleCreateIssue = useCallback(() => {
    nav.push(ScreenName.IssueCreate, { owner, repo });
  }, [nav, owner, repo]);

  useScreenKeybindings(
    [
      { key: "c", description: "Create issue", group: "Actions", handler: handleCreateIssue },
    ],
    [
      { keys: "j/k", label: "navigate", order: 10 },
      { keys: "Enter", label: "open", order: 20 },
      { keys: "c", label: "create", order: 30 },
      { keys: "/", label: "filter", order: 40 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>Issues</text>
      <text color="gray">{`${owner}/${repo}`}</text>
      <box marginTop={1}>
        <text color="gray">Loading issues...</text>
      </box>
    </box>
  );
}
```

## Step 3: Implement `IssueDetailScreen` Placeholder

**File:** `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`

Create the placeholder for the issue detail view.

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function IssueDetailScreen({ entry, params }: ScreenComponentProps) {
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const number = params.number ?? "";

  useScreenKeybindings(
    [],
    [
      { keys: "j/k", label: "scroll", order: 10 },
      { keys: "e", label: "edit", order: 20 },
      { keys: "c", label: "comment", order: 30 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>{`Issue #${number}`}</text>
      <text color="gray">{`${owner}/${repo}`}</text>
      <box marginTop={1}>
        <text color="gray">Loading issue details...</text>
      </box>
    </box>
  );
}
```

## Step 4: Implement `IssueCreateForm` Placeholder

**File:** `apps/tui/src/screens/Issues/IssueCreateForm.tsx`

Create the placeholder for the issue creation form.

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function IssueCreateForm({ entry, params }: ScreenComponentProps) {
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";

  useScreenKeybindings(
    [],
    [
      { keys: "Tab", label: "next field", order: 10 },
      { keys: "Ctrl+S", label: "submit", order: 20 },
      { keys: "Esc", label: "cancel", order: 30 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>New Issue</text>
      <text color="gray">{`${owner}/${repo}`}</text>
      <box marginTop={1}>
        <text color="gray">Issue creation form loading...</text>
      </box>
    </box>
  );
}
```

## Step 5: Implement `IssueEditForm` Placeholder

**File:** `apps/tui/src/screens/Issues/IssueEditForm.tsx`

Create the placeholder for the issue edit form.

```typescript
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";

export function IssueEditForm({ entry, params }: ScreenComponentProps) {
  const owner = params.owner ?? "";
  const repo = params.repo ?? "";
  const number = params.number ?? "";

  useScreenKeybindings(
    [],
    [
      { keys: "Tab", label: "next field", order: 10 },
      { keys: "Ctrl+S", label: "save", order: 20 },
      { keys: "Esc", label: "cancel", order: 30 },
    ],
  );

  return (
    <box flexDirection="column" padding={1} width="100%" height="100%">
      <text bold>{`Edit Issue #${number}`}</text>
      <text color="gray">{`${owner}/${repo}`}</text>
      <box marginTop={1}>
        <text color="gray">Issue edit form loading...</text>
      </box>
    </box>
  );
}
```

## Step 6: Create Barrel Export for Issues Screens

**File:** `apps/tui/src/screens/Issues/index.ts`

```typescript
export { IssueListScreen } from "./IssueListScreen.js";
export { IssueDetailScreen } from "./IssueDetailScreen.js";
export { IssueCreateForm } from "./IssueCreateForm.js";
export { IssueEditForm } from "./IssueEditForm.js";
export type { IssueFilterState } from "./types.js";
```

## Step 7: Update Screen Registry

**File:** `apps/tui/src/router/registry.ts`

1. Import the newly created screens at the top of the file:
   ```typescript
   import { IssueListScreen, IssueDetailScreen, IssueCreateForm, IssueEditForm } from "../screens/Issues/index.js";
   ```
2. Replace `PlaceholderScreen` with the respective real components for the four issue screens (`ScreenName.Issues`, `ScreenName.IssueDetail`, `ScreenName.IssueCreate`, `ScreenName.IssueEdit`). Note: Do NOT remove the `PlaceholderScreen` import entirely, as other un-implemented screens might still use it.

## Step 8: Update Screens Barrel Export

**File:** `apps/tui/src/screens/index.ts`

Add the re-export for the issues screens:

```typescript
/**
 * Screen components for the TUI application.
 */
export * from "./Issues/index.js";
```

## Step 9: Establish E2E Test Harness for Issues

**File:** `e2e/tui/issues.test.ts`

Create the file `e2e/tui/issues.test.ts` and populate it with the test suites specified in the Engineering Spec. This will validate:
- The correct directory and file structure.
- The correct registry wiring.
- Go-to navigation (`g i`).
- Screen rendering and keybindings across multiple terminal sizes (80x24, 120x40, 200x60).
- Deep-link launch via CLI arguments (`--screen issues --repo owner/repo`).

*Note:* Tests that rely on unimplemented features (like `g i` depending on `tui-goto-keybindings`) will fail. This is expected and those tests should not be skipped or modified.

## Step 10: Validation & Type Checking

1. Run `bun run check` inside `apps/tui/` to ensure TypeScript compiles without errors.
2. Run `bun test e2e/tui/issues.test.ts` to confirm tests run (even if some fail as expected per the spec).
3. Ensure no existing tests in `e2e/tui/app-shell.test.ts` are broken by these additions.
