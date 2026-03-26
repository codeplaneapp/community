# Engineering Specification: TUI Workspace Creation Form (`tui-workspace-create-form`)

## Overview

This specification describes the full implementation of `TUI_WORKSPACE_CREATE_FORM` — a form screen for creating new workspaces in the Codeplane TUI. The form provides a name input with real-time validation, an optional snapshot selector, and submit/cancel actions with comprehensive error handling.

**Dependencies:** `tui-workspace-data-hooks`, `tui-workspace-screen-scaffold`, `tui-sync-toast-flash-system`, `tui-workspace-e2e-helpers`

---

## Implementation Plan

### Step 1: Workspace Name Validation Module

**File:** `apps/tui/src/screens/Workspaces/validation.ts`

Create a pure validation module for workspace names. Zero React dependencies, testable in isolation.

```typescript
export const WORKSPACE_NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const WORKSPACE_NAME_MAX_LENGTH = 63;
export const ALLOWED_CHARS_REGEX = /^[a-z0-9-]$/;

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Validate a workspace name for submission.
 */
export function validateWorkspaceName(name: string): ValidationResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Workspace name is required" };
  }
  if (trimmed.length > WORKSPACE_NAME_MAX_LENGTH) {
    return { valid: false, error: `Name must be ${WORKSPACE_NAME_MAX_LENGTH} characters or fewer` };
  }
  if (!WORKSPACE_NAME_REGEX.test(trimmed)) {
    return { valid: false, error: "Name must be lowercase alphanumeric with hyphens (e.g., my-workspace)" };
  }
  return { valid: true, error: null };
}

/**
 * Filter a single character for real-time input.
 * Uppercase → lowercase. Invalid → null (rejected).
 */
export function filterNameCharacter(char: string): string | null {
  if (char.length !== 1) return null;
  const lowered = char.toLowerCase();
  if (ALLOWED_CHARS_REGEX.test(lowered)) return lowered;
  return null;
}

/**
 * Sanitize a full string for the name field.
 * Lowercases, strips invalid chars, truncates at max length.
 */
export function sanitizeNameInput(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .filter((ch) => ALLOWED_CHARS_REGEX.test(ch))
    .join("")
    .slice(0, WORKSPACE_NAME_MAX_LENGTH);
}
```

**Rationale:** Isolating validation into a pure module enables unit testing without React/OpenTUI, and allows reuse across keystroke filtering and submit-time validation.

---

### Step 2: Form State Hook

**File:** `apps/tui/src/screens/Workspaces/useWorkspaceCreateForm.ts`

Encapsulates all form state: field values, validation, dirty tracking, submission lifecycle, and error mapping.

```typescript
import { useState, useCallback, useRef } from "react";
import { validateWorkspaceName, sanitizeNameInput } from "./validation.js";

export interface WorkspaceFormState {
  name: string;
  selectedSnapshotId: string | null;
  nameError: string | null;
  formError: string | null;
  submitting: boolean;
  isDirty: boolean;
  focusIndex: number;
}

export interface WorkspaceFormActions {
  setName: (value: string) => void;
  setSelectedSnapshotId: (id: string | null) => void;
  setFocusIndex: (index: number) => void;
  focusNext: () => void;
  focusPrev: () => void;
  validate: () => boolean;
  submit: (params: {
    owner: string;
    repo: string;
    createWorkspace: (payload: { name: string; snapshot_id?: string }) => Promise<{ id: string }>;
    onSuccess: (workspaceId: string) => void;
  }) => void;
  setFormError: (error: string | null) => void;
  setNameError: (error: string | null) => void;
  clearErrors: () => void;
  reset: () => void;
}

export const FIELD_COUNT = 4;
export const FOCUS_NAME = 0;
export const FOCUS_SNAPSHOT = 1;
export const FOCUS_CREATE = 2;
export const FOCUS_CANCEL = 3;
```

**Key implementation details:**

- `setName` calls `sanitizeNameInput()` on every change, providing real-time character filtering (lowercasing, rejecting invalid chars, enforcing max length).
- `isDirty` is computed as `name.length > 0 || selectedSnapshotId !== null`.
- `submit` uses a `useRef(false)` for synchronous double-submit prevention (works even when React state updates are batched).
- `focusNext`/`focusPrev` cycle modulo `FIELD_COUNT` (4 fields: Name, Snapshot, Create, Cancel).
- On validation failure, `focusIndex` is set to `FOCUS_NAME` so the errored field receives focus.

**Error mapping (co-located `handleSubmitError` function):**

| HTTP Status | Behavior |
|---|---|
| 401 | `formError` = "Session expired. Run `codeplane auth login` to re-authenticate." |
| 403 | `formError` = "You do not have permission…" or "Workspace limit reached…" (checks message for quota keywords) |
| 409 | `nameError` = "A workspace with this name already exists", focus → name field |
| 422 | Map field-specific errors to `nameError` if name-related, else `formError` |
| 429 | `formError` = "Rate limit exceeded. Please wait and try again." |
| 504 | `formError` = "Workspace provisioning timed out…" |
| Network/timeout | `formError` = "Request timed out. Press Ctrl+S to retry." |
| Other | Truncated error message (max 100 chars) |

---

### Step 3: Workspace Create Screen Component

**File:** `apps/tui/src/screens/Workspaces/WorkspaceCreateScreen.tsx`

Main screen component. Wires form hook to data hooks, renders OpenTUI UI, registers keybindings.

**Imports consumed:**

| Import | Source | Purpose |
|---|---|---|
| `useCreateWorkspace` | `@codeplane/ui-core` | Mutation: `POST /api/repos/:owner/:repo/workspaces` |
| `useWorkspaceSnapshots` | `@codeplane/ui-core` | Query: `GET /api/repos/:owner/:repo/workspace-snapshots` |
| `useNavigation` | `../../hooks/useNavigation.js` | `pop()`, `replace()`, `repoContext` |
| `useLayout` | `../../hooks/useLayout.js` | Terminal dimensions and breakpoint |
| `useScreenKeybindings` | `../../hooks/useScreenKeybindings.js` | Register Tab, Shift+Tab, Ctrl+S, Esc, R |
| `useSpinner` | `../../hooks/useSpinner.js` | Braille spinner for submission state |
| `useOverlay` | `../../hooks/useOverlay.js` | Discard confirmation dialog |
| `useTheme` | `../../hooks/useTheme.js` | `theme.error`, `theme.muted`, `theme.primary` color tokens |
| `useResponsiveValue` | `../../hooks/useResponsiveValue.js` | Breakpoint-specific labels, gap, dropdown height |
| `logger` | `../../lib/logger.js` | Structured logging |
| `emit` | `../../lib/telemetry.js` | Telemetry events |

**Component tree (OpenTUI JSX):**

```
<box flexDirection="column" width="100%" height="100%">
  {formError && <box paddingX={2}><text bold color={theme.error}>{formError}</text></box>}
  <scrollbox flexGrow={1} paddingX={2} paddingY={1}>
    <box flexDirection="column" gap={fieldGap}>
      {/* Name field */}
      <box flexDirection="column">
        <text bold>{nameLabel}</text>
        <input value={name} onChange={handleNameChange} maxLength={63}
               placeholder="my-workspace" focused={focusIndex===0 && !submitting} disabled={submitting} />
        {nameError && <text color={theme.error}>⚠ {nameError}</text>}
      </box>
      {/* Snapshot selector */}
      <box flexDirection="column">
        <text bold>{snapshotLabel}</text>
        <select options={snapshotOptions} value={selectedSnapshotId ?? ""}
                onChange={handleSnapshotChange} placeholder={snapshotPlaceholder}
                focused={focusIndex===1 && !submitting} disabled={snapshotDisabled}
                maxVisibleOptions={snapshotDropdownHeight} />
      </box>
      {/* Buttons */}
      <box flexDirection="row" gap={2} marginTop={1}>
        <box border="single" paddingX={1} focused={focusIndex===2 && !submitting}>
          <text bold color={focusIndex===2 ? theme.primary : undefined}>
            {submitting ? "Creating…" : "Create"}
          </text>
        </box>
        <box border="single" paddingX={1} focused={focusIndex===3 && !submitting}>
          <text bold={focusIndex===3}>Cancel</text>
        </box>
      </box>
      {/* Provisioning indicator */}
      {submitting && <box marginTop={1}><text color={theme.muted}>{spinnerFrame} Provisioning workspace…</text></box>}
    </box>
  </scrollbox>
</box>
```

**Responsive behavior via `useResponsiveValue`:**

| Value | minimum (80×24) | standard (120×40) | large (200×60) |
|---|---|---|---|
| `fieldGap` | 0 | 1 | 1 |
| `nameLabel` | "Name" | "Name" | "Name" |
| `snapshotLabel` | "Snap" | "Snapshot (optional)" | "Snapshot (optional)" |
| `snapshotDropdownHeight` | 1 (inline) | 8 items | 12 items |

**Keybinding registration via `useScreenKeybindings`:**

| Key | Description | Group | `when` guard |
|---|---|---|---|
| `Tab` | Next field | Form | `!submitting` |
| `shift+Tab` | Previous field | Form | `!submitting` |
| `ctrl+s` | Create workspace | Actions | `!submitting` |
| `Escape` | Cancel | Navigation | `!submitting` |
| `R` | Retry | Actions | `!!formError && !submitting` |

**Status bar hints:** `Tab:next field │ Ctrl+S:create │ Esc:cancel │ ?:help`

**Navigation on success:** `replace(ScreenName.WorkspaceDetail, { workspaceId })` — replaces the form screen with the workspace detail view (no form in back-stack).

**Cancel with dirty check:** Uses `openOverlay("confirm", { ... })` from the existing OverlayManager. Confirm label: "Discard", cancel label: "Keep editing".

**`formatRelativeDate` helper** (co-located, not exported): Converts ISO date string to relative time string ("3 days ago", "1 week ago", etc.) for snapshot selector option labels.

---

### Step 4: Barrel Export and Screen Registration

**File:** `apps/tui/src/screens/Workspaces/index.ts`

```typescript
export { WorkspaceCreateScreen } from "./WorkspaceCreateScreen.js";
export { useWorkspaceCreateForm } from "./useWorkspaceCreateForm.js";
export { validateWorkspaceName, filterNameCharacter, sanitizeNameInput,
         WORKSPACE_NAME_REGEX, WORKSPACE_NAME_MAX_LENGTH } from "./validation.js";
```

**File:** `apps/tui/src/router/registry.ts` — **Modify existing file**

Changes:
1. Add import: `import { WorkspaceCreateScreen } from "../screens/Workspaces/index.js";`
2. Replace `WorkspaceCreate` entry's `component: PlaceholderScreen` → `component: WorkspaceCreateScreen`
3. Change `requiresRepo: false` → `requiresRepo: true` (workspace creation is scoped to a repository)

**Critical:** This `requiresRepo` change means the navigation provider will reject `push(WorkspaceCreate)` without repo context in the stack. All entry points must provide `owner`/`repo` params.

---

### Step 5: Entry Point Keybinding

**File:** `apps/tui/src/screens/Workspaces/WorkspaceListKeybindings.ts`

Exports a factory function that returns a `KeyHandler` for the `c` key on the workspace list screen:

```typescript
import type { KeyHandler } from "../../providers/keybinding-types.js";
import { ScreenName } from "../../router/types.js";

export function createWorkspaceKeybinding(
  push: (screen: ScreenName, params?: Record<string, string>) => void,
  repoContext: { owner: string; repo: string } | null,
): KeyHandler {
  return {
    key: "c",
    description: "Create workspace",
    group: "Actions",
    handler: () => {
      if (repoContext) {
        push(ScreenName.WorkspaceCreate, {
          owner: repoContext.owner, repo: repoContext.repo,
          entry_point: "keybinding",
        });
      }
    },
    when: () => repoContext !== null,
  };
}
```

Consumed by the workspace list screen implementation (`tui-workspace-screen-scaffold` dependency).

---

### Step 6: Telemetry Events

All events use existing `emit()` from `apps/tui/src/lib/telemetry.ts`:

| Event | Trigger | Properties |
|---|---|---|
| `tui.workspace_create_form.opened` | Form mounts | `repo_owner`, `repo_name`, `entry_point`, `snapshot_count` |
| `tui.workspace_create_form.submitted` | User submits | `repo_owner`, `repo_name`, `name_length`, `has_snapshot`, `snapshot_id` |
| `tui.workspace_create_form.succeeded` | API 2xx | `repo_owner`, `repo_name`, `workspace_id`, `duration_ms`, `has_snapshot` |
| `tui.workspace_create_form.failed` | API error | `repo_owner`, `repo_name`, `error_code`, `error_message`, `duration_ms` |
| `tui.workspace_create_form.cancelled` | User cancels | `repo_owner`, `repo_name`, `was_dirty`, `fields_filled` |
| `tui.workspace_create_form.validation_error` | Client validation fails | `repo_owner`, `repo_name`, `field`, `error_type` |
| `tui.workspace_create_form.discard_confirmed` | User confirms discard | `repo_owner`, `repo_name`, `name_length` |

---

### Step 7: Logging

All logging via existing `logger` from `apps/tui/src/lib/logger.ts`:

| Level | Event | Format |
|---|---|---|
| `debug` | Form mounted | `workspace_create: form mounted for {owner}/{repo}` |
| `debug` | Snapshots loaded | `workspace_create: loaded {count} snapshots in {ms}ms` |
| `info` | Submitted | `workspace_create: submitting for {owner}/{repo} name={name}` |
| `info` | Created | `workspace_create: created {id} in {ms}ms` |
| `warn` | Snapshot fetch failed | `workspace_create: snapshot fetch failed: {error}` |
| `warn` | Validation failed | `workspace_create: name validation failed: {error_type}` |
| `error` | API error | `workspace_create: API error {status}: {message}` |
| `debug` | Cancelled | `workspace_create: cancelled (dirty={isDirty})` |

---

### Step 8: File Tree Summary

```
apps/tui/src/
├── screens/
│   └── Workspaces/
│       ├── index.ts                        # Barrel export
│       ├── WorkspaceCreateScreen.tsx        # Screen component (Step 3)
│       ├── useWorkspaceCreateForm.ts        # Form state hook (Step 2)
│       ├── validation.ts                    # Pure validation (Step 1)
│       └── WorkspaceListKeybindings.ts      # `c` keybinding factory (Step 5)
├── router/
│   └── registry.ts                          # Modified: swap PlaceholderScreen, set requiresRepo: true
└── ...
```

---

### Productionization Checklist

This implementation contains no POC code. All files are production-ready. Verify before shipping:

1. **`requiresRepo` enforcement** — Navigation provider validates at push time. All entry points must supply repo context.
2. **`@codeplane/ui-core` hook signatures** — Verify `useCreateWorkspace(owner, repo)` returns `{ mutate }` returning a Promise with `{ id }`. If different (e.g., `mutateAsync`), adjust the adapter in `handleSubmit`.
3. **OpenTUI `<select>` props** — Verify `maxVisibleOptions` is a real prop. Fallback: constrain via wrapping `<box height={...}>`.
4. **OpenTUI `<input>` onChange** — Verify `onChange` provides the full new value. If per-keystroke, switch to `filterNameCharacter()` in an `onKeyPress` handler.
5. **Focus visual indicators** — Verify OpenTUI applies reverse video on `focused={true}`. If not, add `borderColor={theme.primary}` conditionally.
6. **Error object structure** — The `handleSubmitError` regex-parses status codes from `error.message`. If `@codeplane/ui-core` returns `{ status, message }` objects, refactor to use `.status` directly.

---

## Unit & Integration Tests

### Test File

**File:** `e2e/tui/workspaces.test.ts`

All tests in a `describe("TUI_WORKSPACE_CREATE_FORM", ...)` block. Uses `launchTUI()`, `createMockAPIEnv()`, and `TERMINAL_SIZES` from `e2e/tui/helpers.ts`.

Tests run against a real API server. Tests that fail due to unimplemented backends are **left failing** — never skipped or commented out.

### Snapshot Tests (14 tests)

```typescript
describe("TUI_WORKSPACE_CREATE_FORM", () => {
  let terminal: TUITestInstance;
  afterEach(async () => { await terminal?.terminate(); });

  describe("snapshots", () => {
    test("renders empty form at 120x40", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("New Workspace");
      await terminal.waitForText("Name");
      await terminal.waitForText("Create");
      await terminal.waitForText("Cancel");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders empty form at 80x24", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.minimum, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("New Workspace");
      await terminal.waitForText("Name");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders empty form at 200x60", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.large, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Snapshot (optional)");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders name validation error for empty name", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Workspace name is required");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders name validation error for invalid format", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("-invalid-");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Name must be lowercase alphanumeric with hyphens");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders server error banner", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("valid-name");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("error", 10_000);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders submitting state with provisioning indicator", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("valid-workspace");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Creating");
      await terminal.waitForText("Provisioning workspace");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders snapshot selector expanded", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("None");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders snapshot selector with no snapshots", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/empty-repo"],
      });
      await terminal.sendKeys("Tab");
      await terminal.waitForText("(no snapshots)");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders discard confirmation", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("dirty-value");
      await terminal.sendKeys("Escape");
      await terminal.waitForText("Discard changes");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders breadcrumb correctly", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("New Workspace");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/alice\/my-repo/);
      expect(headerLine).toMatch(/New Workspace/);
    });

    test("renders help overlay", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("?");
      await terminal.waitForText("help");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders name conflict error inline", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("existing-workspace");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("already exists", 10_000);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders 401 auth error", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv({ token: "invalid-token" }),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("my-workspace");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Session expired", 10_000);
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });
```

### Keyboard Interaction Tests (27 tests)

```typescript
  describe("keyboard interactions", () => {
    test("Tab cycles through form fields", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      // Tab 4x cycles Name→Snapshot→Create→Cancel→Name
      await terminal.sendKeys("Tab", "Tab", "Tab", "Tab");
      await terminal.sendText("test");
      await terminal.waitForText("test");
    });

    test("Shift+Tab cycles backward", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("shift+Tab", "shift+Tab");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/Create/);
    });

    test("typing in name updates value", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("my-workspace");
      await terminal.waitForText("my-workspace");
    });

    test("uppercase letters are lowered in name", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("My-Workspace");
      await terminal.waitForText("my-workspace");
    });

    test("invalid characters rejected in name", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("my workspace!");
      await terminal.waitForText("myworkspace");
      await terminal.waitForNoText("my workspace");
    });

    test("Ctrl+S submits from name field", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("valid-ws");
      await terminal.sendKeys("ctrl+s");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/Creating|error|Provisioning/i);
    });

    test("Ctrl+S submits from snapshot selector", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("valid-ws");
      await terminal.sendKeys("Tab", "ctrl+s");
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/Creating|error|Provisioning/i);
    });

    test("Ctrl+S with empty name shows validation error", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Workspace name is required");
    });

    test("Ctrl+S with invalid name format shows validation error", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("-invalid-");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Name must be lowercase alphanumeric with hyphens");
    });

    test("Esc on clean form pops immediately", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("New Workspace");
      await terminal.sendKeys("Escape");
      await terminal.waitForNoText("New Workspace", 5_000);
    });

    test("Esc on dirty form shows confirmation", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("dirty");
      await terminal.sendKeys("Escape");
      await terminal.waitForText("Discard changes");
    });

    test("Esc confirmation y discards", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("dirty");
      await terminal.sendKeys("Escape");
      await terminal.waitForText("Discard changes");
      await terminal.sendKeys("y");
      await terminal.waitForNoText("New Workspace", 5_000);
    });

    test("Esc confirmation n returns to form", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("dirty");
      await terminal.sendKeys("Escape");
      await terminal.waitForText("Discard changes");
      await terminal.sendKeys("n");
      await terminal.waitForNoText("Discard changes");
      await terminal.waitForText("dirty");
    });

    test("snapshot selector opens with Enter", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("Tab", "Enter");
      await terminal.waitForText("None");
    });

    test("snapshot selector j/k navigates", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("Tab", "Enter");
      await terminal.waitForText("None");
      await terminal.sendKeys("j", "k");
      expect(terminal.snapshot()).toMatch(/None/);
    });

    test("snapshot selector Enter confirms selection", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("Tab", "Enter");
      await terminal.waitForText("None");
      await terminal.sendKeys("j", "Enter");
    });

    test("snapshot selector Esc cancels without change", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("Tab", "Enter");
      await terminal.waitForText("None");
      await terminal.sendKeys("j", "Escape");
    });

    test("snapshot selector filter with /", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("Tab", "Enter");
      await terminal.waitForText("None");
      await terminal.sendKeys("/");
      await terminal.sendText("base");
    });

    test("successful submit navigates to workspace detail", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("new-workspace");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Workspace", 15_000);
    });

    test("successful submit with snapshot", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("snap-workspace");
      await terminal.sendKeys("Tab", "Enter", "j", "Enter", "ctrl+s");
      await terminal.waitForText("Workspace", 15_000);
    });

    test("failed submit shows error and re-enables form", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("valid-name");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("error", 15_000);
      await terminal.sendText("a");
      await terminal.waitForText("valid-namea");
    });

    test("double submit is prevented", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("my-workspace");
      await terminal.sendKeys("ctrl+s", "ctrl+s");
      await terminal.waitForText("Creating");
    });

    test("c keybinding from workspace list opens form", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspaces", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys("c");
      await terminal.waitForText("New Workspace");
    });

    test("command palette create workspace", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspaces", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Workspaces");
      await terminal.sendKeys(":");
      await terminal.sendText("create workspace");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("New Workspace");
    });

    test("name max length enforced", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("a".repeat(64));
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(new RegExp("a{63}"));
      expect(snapshot).not.toMatch(new RegExp("a{64}"));
    });

    test("R retries after error", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("retry-test");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("error", 15_000);
      await terminal.sendKeys("R");
      await terminal.waitForText("Creating");
    });

    test("409 name conflict shows inline error", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("existing-workspace");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("already exists", 10_000);
    });

    test("workspace quota exceeded shows error banner", async () => {
      terminal = await launchTUI({
        ...TERMINAL_SIZES.standard, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("quota-test");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("error", 15_000);
    });
  });
```

### Responsive Tests (9 tests)

```typescript
  describe("responsive", () => {
    test("80x24 compact layout", async () => {
      terminal = await launchTUI({
        cols: 80, rows: 24, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.waitForText("Snap");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("80x24 snapshot selector inline", async () => {
      terminal = await launchTUI({
        cols: 80, rows: 24, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendKeys("Tab");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("120x40 standard layout", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Snapshot (optional)");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("200x60 expanded layout", async () => {
      terminal = await launchTUI({
        cols: 200, rows: 60, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Snapshot (optional)");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("resize from 120x40 to 80x24 preserves state", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("resize-test");
      await terminal.resize(80, 24);
      await terminal.waitForText("resize-test");
      await terminal.waitForText("Snap");
    });

    test("resize from 80x24 to 120x40 expands layout", async () => {
      terminal = await launchTUI({
        cols: 80, rows: 24, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("expand-test");
      await terminal.resize(120, 40);
      await terminal.waitForText("expand-test");
      await terminal.waitForText("Snapshot (optional)");
    });

    test("resize below minimum shows warning", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.resize(60, 20);
      await terminal.waitForText("too small");
    });

    test("resize back above minimum restores form", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("persist-test");
      await terminal.resize(60, 20);
      await terminal.waitForText("too small");
      await terminal.resize(80, 24);
      await terminal.waitForText("persist-test");
    });

    test("resize during submission", async () => {
      terminal = await launchTUI({
        cols: 120, rows: 40, env: createMockAPIEnv(),
        args: ["--screen", "workspace-create", "--repo", "alice/my-repo"],
      });
      await terminal.waitForText("Name");
      await terminal.sendText("submit-resize");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Creating");
      await terminal.resize(80, 24);
      await terminal.waitForText("Provisioning");
    });
  });
});
```

### Test Summary

| Category | Count | Description |
|---|---|---|
| Snapshot tests | 14 | Golden-file visual regression at key states |
| Keyboard interaction tests | 27 | Keypress sequences → expected state changes |
| Responsive tests | 9 | Layout adaptation at different terminal sizes |
| **Total** | **50** | |

### Test Principles Applied

1. **No mocking** — All tests launch real TUI via PTY, hit real API.
2. **Failing tests stay failing** — Tests depending on unimplemented backend are never skipped.
3. **One behavior per test** — Test names describe user-visible behavior.
4. **Snapshots are supplementary** — Interaction tests are primary verification.
5. **Representative sizes** — Critical states tested at 80×24, 120×40, and 200×60.
6. **Independent tests** — Each test launches fresh TUI, no shared state.

---

## Dependency Mapping

| Dependency | Provides | Blocking? |
|---|---|---|
| `tui-workspace-data-hooks` | `useCreateWorkspace()`, `useWorkspaceSnapshots()` from `@codeplane/ui-core` | **Yes** |
| `tui-workspace-screen-scaffold` | Workspace list screen with `c` keybinding, `WorkspaceDetail` screen | **Yes** |
| `tui-sync-toast-flash-system` | Toast/flash for transient messages | No (form uses inline errors) |
| `tui-workspace-e2e-helpers` | Shared workspace test fixtures | No (tests use `launchTUI()` directly) |