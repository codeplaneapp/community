# Implementation Plan: TUI Repository Settings Tab View

This document outlines the step-by-step implementation for the Repository Settings tab in the Codeplane TUI. It strictly adheres to OpenTUI patterns, React 19 standards, and handles constraints discovered in the repository.

## Step 1: Scaffold Directories & Core Definitions

Since `apps/tui/src/screens/Repository` does not currently exist, we will create the necessary directory tree for the settings tab.

**1. Create directories:**
```bash
mkdir -p apps/tui/src/screens/Repository/tabs/Settings
mkdir -p apps/tui/src/hooks/data
```

**2. Create `apps/tui/src/screens/Repository/tabs/Settings/types.ts`:**
Implement the exact types defined in the spec: `SettingsFieldId`, `SettingsSectionId`, `SettingsField`, `InteractionMode`, `RepoPermissions`, and `ValidationResult`.

**3. Create `apps/tui/src/screens/Repository/tabs/Settings/constants.ts`:**
Export `SETTINGS_FIELDS`, regex constants (`REPO_NAME_REGEX`, etc.), layout constants (`LABEL_WIDTH_MINIMUM`, etc.), and `SECTION_HEADERS`.

## Step 2: Implement Validation Utilities

**File:** `apps/tui/src/screens/Repository/tabs/Settings/validation.ts`
Implement pure functions for field validation. These must have zero React or OpenTUI dependencies.
- `validateRepoName(value: string)`
- `validateDescription(value: string)`
- `validateDefaultBookmark(value: string)`
- `validateTopics(rawValue: string)`
- `validateTransferOwner(value: string)`
- `parseTopics(rawValue: string)`

## Step 3: Implement Data Hooks with API Client Adaptations

**File:** `apps/tui/src/hooks/data/useRepoSettings.ts`
Implement the data hooks using `useOptimisticMutation`. Address the `useAPIClient` location and structure constraints.

```typescript
import { useCallback, useState } from "react";
import { useAPIClient } from "../../providers/APIClientProvider.js";
import { useOptimisticMutation } from "../useOptimisticMutation.js";

// Helper to use fetch directly if the mock APIClient lacks .request()
async function doRequest(apiClient: any, path: string, init: RequestInit) {
  const url = `${apiClient.baseUrl ?? ""}${path}`;
  const headers = { ...init.headers, "Content-Type": "application/json" } as any;
  if (apiClient.token) headers["Authorization"] = `Bearer ${apiClient.token}`;

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "Unknown error" }));
    const err = new Error(body.message ?? `HTTP ${response.status}`);
    (err as any).status = response.status;
    throw err;
  }
  return response;
}
```
Export `useUpdateRepo`, `useReplaceRepoTopics`, `useArchiveRepo`, `useUnarchiveRepo`, `useTransferRepo`, and `useDeleteRepo` utilizing this helper to mutate settings.

## Step 4: Implement Settings State Machine

**File:** `apps/tui/src/screens/Repository/tabs/Settings/useSettingsState.ts`
Export `useSettingsState`. This hook manages `focusedIndex`, `mode`, `editValue`, and `statusMessage`.
- Include timer management using `useRef` for `statusTimerRef` to handle the `PERMISSION_DENIED_FLASH_MS` flash messages.
- Ensure `activateField` validates `permissions.isAdmin` and `permissions.isOwner` based on the field's requirements.

## Step 5: Implement UI Components with Responsive Fallbacks

**File:** `apps/tui/src/screens/Repository/tabs/Settings/SettingsSection.tsx`
Wrap the header generation. Handle responsive layouts safely.
```typescript
// Safely fallback if breakpoint is null (terminal < 80x24)
const label = useResponsiveValue({
  minimum: header.short,
  standard: header.full,
  large: header.full
}, header.short);
```

**File:** `apps/tui/src/screens/Repository/tabs/Settings/SettingsFieldRow.tsx`
Implement the field row. Use the `focusAttributes` logic (`attributes={8}` for INVERSE when focused). Provide the `labelWidth` fallback for `useResponsiveValue`.

**File:** `apps/tui/src/screens/Repository/tabs/Settings/Prompts.tsx`
Implement `ConfirmPrompt`, `TransferPrompt`, and `DeletePrompt` in a single file or multiple. Ensure they render as absolute overlays.
```typescript
// Example OpenTUI focus attachment for inputs within overlays:
const inputRef = useRef<any>(null);
useEffect(() => {
  inputRef.current?.focus?.();
}, []);
```

## Step 6: Assemble the Settings Tab

**File:** `apps/tui/src/screens/Repository/tabs/Settings/SettingsTab.tsx`
Assemble the main view.
- **Dependencies:** Import `useTheme`, `useLayout`, `useScreenKeybindings`, and `useNavigation`.
- **Context:** Assume `useRepoContext` is provided by the parent scaffold (`tui-repo-screen-scaffold`). If it doesn't exist yet, create a stub at `apps/tui/src/screens/Repository/RepoContext.ts`.
- **Keybindings:** Map the vim-style bindings (`j`, `k`, `G`, `ctrl+d`, `ctrl+u`, `ctrl+s`, `Escape`, `y`, `n`, `Enter`). Ensure conditional bindings use the `when` property supported by the `KeyHandler` interface.
- **Rendering:** Use `<scrollbox scrollY={true}>` for the main container, rendering mapped sections and absolute overlay components depending on the current state machine `mode`.

## Step 7: Telemetry and Integration

**1. Create `apps/tui/src/screens/Repository/tabs/Settings/telemetry.ts`:**
Implement telemetry wrappers pointing to `apps/tui/src/lib/telemetry.ts`.

**2. Create `apps/tui/src/screens/Repository/tabs/Settings/index.ts`:**
```typescript
export { SettingsTab } from "./SettingsTab.js";
```

**3. Update Tab Router:**
In `apps/tui/src/screens/Repository/tabs/index.ts` (create if needed), register `SettingsTab` to render when the active tab index resolves to Settings.

## Step 8: End-to-End Testing

**File:** `e2e/tui/repository.test.ts`
Append the comprehensive E2E test suite described in the engineering spec using `@microsoft/tui-test`. 

1. Import TUI launch helpers (`launchTUI`).
2. Add the `describe("TUI_REPO_SETTINGS_VIEW", ...)` block.
3. Add all `SNAP-*`, `KEY-*`, `RSP-*`, and `INT-*` tests.
4. Add the `describe("validation", ...)` block for pure unit tests on `validation.ts` logic.

Run tests using `bun test e2e/tui/repository.test.ts` to ensure snapshot baselines are generated. Ensure failing mock-backend tests are left in their failing state intentionally as per specifications.