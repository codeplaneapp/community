# Implementation Plan: TUI_WORKFLOW_ARTIFACTS_VIEW

This document outlines the step-by-step implementation for the Workflow Artifacts View in the Codeplane TUI, matching the engineering specification and architecture constraints.

## 1. Scaffold Utilities
**File:** `apps/tui/src/screens/Workflows/artifact-utils.ts`
Create utility functions to handle artifact-specific formatting and logic without polluting the view components.

- `formatExpiration(expiresAt: string | null): { text: string; color: CoreTokenName }`
  - Handle `null` (return `—` / `muted`).
  - Compute relative time if future (e.g., `29d`), or return `exp` / `error` if in the past.
- `getArtifactStatusIcon(artifact: WorkflowArtifact): { icon: string; color: CoreTokenName }`
  - Derives status icon based on `status` and `expires_at`.
  - Returns `●` (success) for ready, `◎` (warning) for pending, `○` (muted) for expired.
- `formatTotalSize(artifacts: WorkflowArtifact[]): string`
  - Sums up `artifact.size` for all artifacts and formats via the existing `formatBytes` utility.
- `filterAndSortArtifacts(...)`
  - A pure function to apply text search, status filtering, and sorting to the raw array.

## 2. Scaffold UI Components

### 2.1. Artifact Row
**File:** `apps/tui/src/screens/Workflows/components/ArtifactRow.tsx`
- Build a stateless `<box flexDirection="row">` component representing a single list item.
- **Props:** `artifact: WorkflowArtifact`, `isFocused: boolean`, `breakpoint: string`.
- Implement responsive column rendering:
  - `80x24` (Minimum): Icon + Name + Size + Expiration.
  - `120x40` (Standard): Adds Content Type, Release indicator, Timestamp.
  - `200x60+` (Large): Full column width including Release Tag.
- Use `fitWidth` and `truncateRight` from `text.ts` to ensure strict column alignment and ANSI safety.

### 2.2. Artifact Detail Overlay
**File:** `apps/tui/src/screens/Workflows/components/ArtifactDetailOverlay.tsx`
- Implement as a component-local modal (not using `OverlayManager` to allow custom layout and keybindings).
- **Props:** `artifact: WorkflowArtifact`, `onClose: () => void`, `onDownload: () => void`, `onDelete: () => void`.
- Layout: 60% × 50% centered box with a `<scrollbox>` for overflowing metadata.
- Display fields: Name, Type, Exact/Formatted Size, Timestamps, GCS path, Release info.
- Manually register `PRIORITY.MODAL` keybindings on mount: `Esc` (Close), `D` (Download), `x` (Delete).

### 2.3. Artifact Delete Confirmation Overlay
**File:** `apps/tui/src/screens/Workflows/components/ArtifactDeleteOverlay.tsx`
- Implement a custom error-styled modal (40% × 25%, ANSI 196 border).
- **Props:** `artifact: WorkflowArtifact`, `onConfirm: () => void`, `onCancel: () => void`, `isSubmitting: boolean`, `error: string | null`.
- Show a loading spinner during the `isSubmitting` state to block double submissions.

## 3. Implement the Main View
**File:** `apps/tui/src/screens/Workflows/WorkflowArtifactsView.tsx`

### 3.1. State & Hooks
- **Router Params:** Extract `owner`, `repo`, `runId`.
- **Data Hooks:**
  - `useWorkflowRunArtifacts(owner, repo, runId)` for fetching.
  - `useDeleteWorkflowArtifact()` for the delete mutation.
- **Local State:**
  - `filterStatus`: `'all' | 'ready' | 'pending' | 'expired'`
  - `sortOrder`: Enum covering created, name, and size combinations.
  - `searchText`: Search query string.
  - `focusedArtifactId`: Tracks the focused item across re-sorts.
  - `overlayState`: `{ type: 'none' | 'detail' | 'delete', artifactId?: string }`

### 3.2. Layout Structure
- **Header/Title:** Render "Artifacts (N)" and the computed total size.
- **Toolbar:** Filter tags, sort mode indicator, and search `<input>`.
- **List:** Render a `<scrollbox>` containing the mapped `ArtifactRow` components. Enforce the `MAX_ARTIFACTS` (200) client-side limit here.

### 3.3. Keybindings
- Use `useScreenKeybindings` at `PRIORITY.SCREEN`:
  - `f`: Cycle `filterStatus`.
  - `s`: Cycle `sortOrder`.
  - `/`: Focus search input.
  - `Enter`: Open Detail overlay for `focusedArtifactId`.
  - `D`: Dispatch download for `focusedArtifactId`.
  - `x`: Open Delete overlay for `focusedArtifactId`.
  - `q` / `Esc`: Pop screen/tab.

### 3.4. Download Delegation
- Validate that the artifact is `ready` (block `pending`/`expired`).
- Use Node's `child_process.spawn` to run:
  `codeplane artifact download <runId> <name> --repo <owner>/<repo> --output <name>`
- Pass `process.env.CODEPLANE_TOKEN`.
- Manage status bar feedback ("Downloading...", "Download completed", or error).

### 3.5. Delete Action
- Trigger `deleteArtifact({ runId, name })` from the delete overlay's confirmation.
- Close the modal on success and update the status bar.
- If the optimistic update fails, display the API error in the status bar.

## 4. Integrate into Navigation
**File:** `apps/tui/src/screens/Workflows/WorkflowRunDetail.tsx` (or parent view)
- Implement the artifacts view as a selectable tab within the workflow run detail screen.
- Register the `a` keybinding to switch the active tab to Artifacts.
- Pass the required `owner`, `repo`, and `runId` props down to `WorkflowArtifactsView`.

## 5. Exports & Registry
**File:** `apps/tui/src/screens/Workflows/index.ts`
- Export `WorkflowArtifactsView` and any shared types.

## 6. End-to-End Tests
**File:** `e2e/tui/workflows.test.ts`
Append the 122 required test cases utilizing `@microsoft/tui-test`.

- **Snapshot Tests (30):** Validate 80x24, 120x40, 200x60 layouts, empty states, icon rendering, text truncation, and overlay visuals.
- **Keyboard Tests (42):** Validate `j`/`k` bounds, `Enter`/`/` focus shifting, `f`/`s` cycling, `D`/`x` action triggers, and rapid input safety.
- **Responsive Tests (14):** Validate column disappearance/appearance on resize and focus retention.
- **Integration Tests (22):** Validate API error handling, the 200-item hard cap, download subprocess lifecycles, and delete mutation rollbacks.
- **Edge Cases (14):** Test unauthenticated states, extreme string lengths, 0-byte payloads, and action spamming race conditions.