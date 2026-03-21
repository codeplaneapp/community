# Research Findings: `tui-workflow-data-hooks`

I have thoroughly investigated the relevant directories in the workspace to gather context for implementing the `tui-workflow-data-hooks` feature. My findings reveal a critical discrepancy between the engineering specification's assumptions and the current state of the repository, which provides a strong starting point for the implementation.

## 1. `packages/ui-core/` Context (Critical Finding)

The engineering specification states:
> "Since `@codeplane/ui-core` does not yet exist as a package, these hooks are implemented directly in `apps/tui/src/hooks/` as TUI-local hooks that consume an `APIClientProvider` context."

**Finding:** The `@codeplane/ui-core` package **already exists** in `packages/ui-core/` and contains well-developed primitives for exactly what this ticket requires. 

Instead of building a minimal shim in `apps/tui/src/providers/APIClientProvider.tsx` and building custom primitive hooks from scratch in `apps/tui/src/hooks/`, we can (and likely should) utilize the existing abstractions in `@codeplane/ui-core`.

### `APIClient` and `APIClientProvider`
- **Location:** `packages/ui-core/src/client/` (`context.ts`, `types.ts`, `createAPIClient.ts`)
- **API:** The existing `APIClient` provides a `request(path, options)` method returning a raw `Promise<Response>` rather than the specialized `get/post/delete` generic methods proposed in the spec.
- **Provider:** `APIClientProvider` and `useAPIClient` are exported directly from `@codeplane/ui-core`.

### Reusable Internal Hooks
- **Location:** `packages/ui-core/src/hooks/internal/`
- **`usePaginatedQuery.ts`:** An advanced implementation of paginated querying already exists. It accepts a `PaginatedQueryConfig` containing the `client`, `path`, `cacheKey`, `perPage`, `enabled`, `maxItems` (memory cap equivalent), and an `autoPaginate` flag. It returns `{ items, totalCount, isLoading, error, hasMore, fetchMore, refetch }` (slightly different names than the spec's `data`, `loading`, `loadMore`).
- **`useMutation.ts`:** An existing implementation that accepts a `mutationFn` along with callbacks like `onOptimistic`, `onSuccess`, `onError`, and `onSettled`. It returns `{ mutate, isLoading, error, reset }` (compared to the spec's `execute`, `loading`, `error`, `reset`).
- **Missing:** There is currently no simple `useQuery.ts` primitive for single-resource fetching in the core package, which means we will either need to add it there or implement it locally as `apps/tui/src/hooks/useQuery.ts`.

### Shared Types and Error Handling
- **Location:** `packages/ui-core/src/types/errors.ts`
- **Details:** The workspace already exports a structured `HookError` union type (`ApiError | NetworkError`). The `ApiError` class provides `status`, `code`, and `detail` properties. The existing `parseResponseError` utility handles HTTP status code-to-error mapping.

## 2. `apps/tui/` Context

- **Current Hooks:** The `apps/tui/src/hooks/` directory currently contains only `useClipboard.ts`, `useDiffSyntaxStyle.ts`, and `useNavigation.ts`, along with a barrel `index.ts` file. 
- **Current Providers:** The `apps/tui/src/providers/` directory currently contains only `NavigationProvider.tsx`.
- **Testing:** The `e2e/tui/` directory does not yet contain a `workflows.test.ts` file, meaning it will need to be created exactly as defined in the spec.

## 3. Other Directories

- **`context/opentui/`**: This directory does not exist in the file system. However, standard OpenTUI components (`<box>`, `<scrollbox>`, `<text>`) and hooks are available per the provided documentation in the prompt context.
- **`apps/ui/src/`**: This directory does not exist locally (the web UI might be structured differently or not checked out in this specific environment snippet).

## 4. Implementation Strategy Considerations

Given that the foundational hooks and API context are already present in `@codeplane/ui-core`, there are two paths forward:
1. **Literal Spec Compliance:** Ignore the existing `@codeplane/ui-core` primitives and strictly build the local `usePaginatedQuery`, `useMutation`, `useQuery`, and minimal `APIClientProvider` in `apps/tui/src/hooks/` as requested by the spec.
2. **Pragmatic Adaptation (Recommended):** Use the existing `@codeplane/ui-core` types, `useAPIClient`, `useMutation`, and `usePaginatedQuery` to build the workflow hooks in `apps/tui/src/hooks/`, bridging the gap between the spec's desired domain models and the existing workspace reality.