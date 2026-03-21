# Implementation Plan: tui-workspace-data-hooks

This plan implements the workspace data access layer for `@codeplane/ui-core`, providing typed, reactive data access with pagination, loading, error states, and optimistic mutations. 

*Note on Scope Boundaries: According to the Engineering Specification, this ticket is strictly scoped to `packages/ui-core/`. TUI screen code (`apps/tui/src/`) and E2E tests (`e2e/tui/`) are excluded from this ticket and belong in subsequent tickets (e.g., `tui-workspace-e2e-scaffolding`).*

## Phase 1: Type Definitions

### 1. Workspace Domain Types
*   **Create:** `packages/ui-core/src/types/workspaces.ts`
*   **Action:** Define core domain types (`Workspace`, `WorkspaceStatus`, `WorkspaceSession`, `WorkspaceSSHInfo`, `WorkspaceSnapshot`) mirroring the SDK wire types. Define request/option interfaces (`CreateWorkspaceRequest`, `WorkspacesOptions`, etc.) and SSE event types (`WorkspaceStatusEvent`).
*   **Update:** `packages/ui-core/src/types/index.ts`
*   **Action:** Add exports for all new types alongside the existing type exports.

## Phase 2: Single-Resource Query Hooks

### 2. `useWorkspace` Hook
*   **Create:** `packages/ui-core/src/hooks/workspaces/useWorkspace.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspace.test.ts`
*   **Action:** Implement simple single-resource fetch for `/api/repos/${owner}/${repo}/workspaces/${workspaceId}` using `useState` and `useEffect`. Add stale-while-revalidate behavior, an empty `workspaceId` guard (avoids network requests if empty), and `refetch` capability.

### 3. `useWorkspaceSSH` Hook
*   **Create:** `packages/ui-core/src/hooks/workspaces/useWorkspaceSSH.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSSH.test.ts`
*   **Action:** Fetch SSH connection info (`/api/repos/${owner}/${repo}/workspaces/${workspaceId}/ssh`). Compute `tokenExpiresAt = Date.now() + 5 * 60 * 1000`. Implement a 1-second interval timer for `isTokenExpired`. Clear timer on unmount.

## Phase 3: Paginated Query Hooks

### 4. `useWorkspaces` Hook
*   **Create:** `packages/ui-core/src/hooks/workspaces/useWorkspaces.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaces.test.ts`
*   **Action:** Implement paginated fetch for `/api/repos/${owner}/${repo}/workspaces` using `usePaginatedQuery`. Parse `X-Total-Count` header. Cap `perPage` at 100. Implement client-side `options.status` filtering.

### 5. `useWorkspaceSessions` Hook
*   **Create:** `packages/ui-core/src/hooks/workspaces/useWorkspaceSessions.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSessions.test.ts`
*   **Action:** Paginated fetch for `/api/repos/${owner}/${repo}/workspace/sessions`. Apply client-side filtering to return only sessions matching `workspaceId`. Return all sessions if `workspaceId` is empty.

### 6. `useWorkspaceSnapshots` Hook
*   **Create:** `packages/ui-core/src/hooks/workspaces/useWorkspaceSnapshots.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSnapshots.test.ts`
*   **Action:** Paginated fetch for `/api/repos/${owner}/${repo}/workspace-snapshots`. Parse `X-Total-Count` and cap `perPage` at 100.

## Phase 4: Mutation Hooks

### 7. Workspace Creation Hook
*   **Create:** `packages/ui-core/src/hooks/workspaces/useCreateWorkspace.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useCreateWorkspace.test.ts`
*   **Action:** Implement `useMutation` for `POST .../workspaces`. Implement client-side name validation (1-63 chars, regex `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`). Validation must throw synchronously before any network call.

### 8. Workspace Suspend and Resume Hooks
*   **Create:** `packages/ui-core/src/hooks/workspaces/useSuspendWorkspace.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/useResumeWorkspace.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useSuspendWorkspace.test.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useResumeWorkspace.test.ts`
*   **Action:** Implement mutations to `POST .../workspaces/:id/suspend` and `resume`. Accept optimistic, revert, error, and settled callbacks. Throw `ApiError(400)` if `workspaceId` is empty.

### 9. Delete Workspace Hook
*   **Create:** `packages/ui-core/src/hooks/workspaces/useDeleteWorkspace.ts`
*   **Create:** `packages/ui-core/src/hooks/workspaces/__tests__/useDeleteWorkspace.test.ts`
*   **Action:** Implement deduplicated DELETE `.../workspaces/:id`. Maintain a `Map<string, Promise<void>>` ref to prevent concurrent deletes of the same ID. Expect 204 empty body on success.

### 10. Session & Snapshot Mutations
*   **Create:** 
    *   `packages/ui-core/src/hooks/workspaces/useCreateWorkspaceSession.ts`
    *   `packages/ui-core/src/hooks/workspaces/useDestroyWorkspaceSession.ts`
    *   `packages/ui-core/src/hooks/workspaces/useCreateWorkspaceSnapshot.ts`
    *   `packages/ui-core/src/hooks/workspaces/useDeleteWorkspaceSnapshot.ts`
*   **Create:** Unit tests for each hook in `__tests__/` directory.
*   **Action:** Implement deduplicated `useDeleteWorkspaceSnapshot` and `useDestroyWorkspaceSession`. *Note: `useDestroyWorkspaceSession` must use `POST .../destroy`, not `DELETE`.* Validations included for `workspace_id`, `cols`, and `rows`.

## Phase 5: Barrel Exports & Verification

### 11. Final Integration
*   **Create:** `packages/ui-core/src/hooks/workspaces/index.ts`
*   **Action:** Export all workspace hooks and callback interfaces.
*   **Update:** `packages/ui-core/src/index.ts`
*   **Action:** Update the main barrel to export types and hooks for future TUI screens.
*   **Verification:** Run `cd packages/ui-core && pnpm tsc --noEmit` and `bun test packages/ui-core/src/hooks/workspaces/` to ensure everything compiles and all tests function correctly (mock passing, integration failing as expected).

## Phase 6: E2E Testing & TUI Screens (Deferred)
*   *Per the engineering specification, `apps/tui/src/` and `e2e/tui/` changes are explicitly scoped out of this ticket to ensure clean modularity.*
*   The next ticket (`tui-workspace-e2e-scaffolding`) will introduce the `@microsoft/tui-test` snapshots and the OpenTUI layout consuming these `@codeplane/ui-core` hooks.