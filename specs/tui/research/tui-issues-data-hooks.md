# TUI Issues Data Hooks: Research Findings

## Overview
This document provides comprehensive research and context for implementing the `tui-issues-data-hooks` feature in the Codeplane UI Core. Based on the provided Engineering Specification and TUI product requirements, the implementation will reside entirely within the framework-agnostic `packages/ui-core/` data layer. 

## Key Architectural Patterns

1.  **Shared UI Core Hooks**
    *   The TUI relies heavily on `@codeplane/ui-core` which encapsulates API interactions, authentication, and error handling.
    *   All new data hooks must conform to the established patterns from the agent data hooks (e.g., `usePaginatedQuery`, `useMutation`).
    *   Pagination is standardized using legacy `page` and `per_page` query parameters capped at 100 items.
    *   Errors are standardized into `ApiError` and `NetworkError` structures with specific HTTP status mappings (e.g., 401 maps to `UNAUTHORIZED`).

2.  **Optimistic Updates**
    *   Mutations modifying existing resources (like updating an issue, adding a comment, or removing a label) must implement an optimistic update pattern with `onOptimistic`, `onRevert`, `onError`, and `onSettled` callbacks.
    *   Optimistic updates for lists append placeholder items (e.g., a temporary comment with a negative `id` sentinel).

3.  **Stale-While-Revalidate and Caching**
    *   Single-resource hooks (e.g., `useIssue`) implement a 30-second cache window tracked via `useRef` to avoid unnecessary network requests on component remounts.
    *   When explicitly refetched, existing data is preserved while the new request is in flight (`stale-while-revalidate`).

## Required Framework Patch

The existing `usePaginatedQuery` internal utility requires a small patch to properly handle extra query parameters (such as the `state` filter used by issue lists). 

**File:** `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`

Change the URL construction from:
```typescript
const url = `${path}?page=${currentPage}&per_page=${perPage}`;
```
To:
```typescript
const separator = path.includes('?') ? '&' : '?';
const url = `${path}${separator}page=${currentPage}&per_page=${perPage}`;
```
This ensures backward compatibility while supporting paths like `/api/repos/:owner/:repo/issues?state=open`.

## Hook Implementation Summary

### Types (`packages/ui-core/src/types/issues.ts`)
Define strict wire types representing the JSON payload returned by the Codeplane API, including `Issue`, `IssueComment`, `IssueEvent`, `Label`, and `Milestone`. Request bodies and option objects must also be strictly typed.

### Query Hooks (Read-Only)
-   **`useIssues` / `useIssueComments` / `useRepoLabels` / `useRepoMilestones` / `useIssueEvents`:**
    *   All wrap `usePaginatedQuery`.
    *   Read `X-Total-Count` from response headers.
    *   Maintain a hard client-side item cap (`maxItems = 500`).
    *   Note: `useIssueEvents` targets an endpoint that is not yet implemented on the server; hooks and tests must be implemented regardless.
-   **`useIssue`:**
    *   Single resource fetch with internal 30s cache.
    *   Bypasses fetch for invalid issue IDs (<= 0).
-   **`useRepoCollaborators`:**
    *   Temporary workaround hook using `GET /api/search/users?q=...` instead of a dedicated repository collaborators endpoint.

### Mutation Hooks (Write)
-   **`useCreateIssue` / `useAddIssueLabels`:**
    *   Standard mutations returning the created or updated resource.
    *   Include client-side validation before the network request (e.g., checking for an empty title).
-   **`useUpdateIssue` / `useCreateIssueComment` / `useRemoveIssueLabel`:**
    *   Implement full optimistic update sequences via callbacks.

## Constraints and Limitations
*   **No Cross-Hook Cache Invalidation:** The current spec strictly bounds invalidation. Firing a mutation like `useCreateIssue` does not automatically refetch `useIssues`. Invalidation must be handled at the consumer (TUI) layer by explicitly calling `refetch()`.
*   **Event Endpoint Missing:** `GET /api/repos/:owner/:repo/issues/:number/events` is not implemented in the backend. Integration tests for `useIssueEvents` are expected to fail with `404 Not Found`.
*   **Collaborators Workaround:** The system relies on a global user search in lieu of a real collaborators endpoint.

## Implementation Scope
The implementation must exclusively target `packages/ui-core/src/hooks/issues/` and `packages/ui-core/src/types/`. No TUI display components (`apps/tui/src/`) or E2E tests (`e2e/tui/`) should be created as part of this scope.