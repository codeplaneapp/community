# Research Findings: Repository Data Hooks Adapter Layer

## 1. Current State of APIClientProvider

- **File:** `apps/tui/src/providers/APIClientProvider.tsx`
- **Current Implementation:** Currently a stub. It defines an `APIClient` interface that only contains `baseUrl` and `token`. The `createAPIClient` function simply returns these options. It does not provide a `request` method.
- **Action Required:** We must upgrade this provider to implement the real `request` method as expected by `@codeplane/ui-core` before we can build the data hooks.

## 2. Shared `ui-core` Types and Client Implementations

Since the `@codeplane/ui-core` package is not yet available in the workspace `packages/` directory, its implementations currently live in `specs/tui/packages/ui-core/`. We will need to inline these utilities into the TUI codebase.

- **`APIClient` Interface & Options:** Located at `specs/tui/packages/ui-core/src/client/types.ts`. Provides `APIClient` and `APIRequestOptions` interfaces.
- **`createAPIClient` Factory:** Located at `specs/tui/packages/ui-core/src/client/createAPIClient.ts`. It manages the `fetch` call, automatically appends the `Authorization: token ...` header, injects `Content-Type: application/json` for requests with bodies, and handles aborts via signals.
- **Error Types:** Located at `specs/tui/packages/ui-core/src/types/errors.ts`. Provides the `NetworkError` and `ApiError` classes, as well as `parseResponseError`. The `createAPIClient` implementation depends on `NetworkError` to catch failed fetches.

## 3. Existing TUI Hooks and Providers

- **`useAuth`:** Defined in `apps/tui/src/hooks/useAuth.ts` and returns the context from `AuthProvider`. It exposes the `retry()` method which is necessary for the `useTUIFetch` implementation when dealing with 401 Unauthorized errors.
- **`useOptimisticMutation`:** Defined in `apps/tui/src/hooks/useOptimisticMutation.ts`. We will use this in `useStarRepo` for instantaneous UI updates (star toggling) and automatic fallbacks if the server returns an error. It manages loading states via the `LoadingProvider`.
- **`useLoading` & `useScreenLoading`:** Exist and operate correctly. Data hooks will provide the `isLoading` and `error` states to these hooks in consumer screens.
- **Missing Directory:** The `apps/tui/src/hooks/data/` directory does not exist yet. We will need to create it for the new repository data hooks.

## 4. Test Files and Infrastructure

- **Location:** `e2e/tui/` contains tests like `app-shell.test.ts` and `agents.test.ts`.
- **`repository.test.ts`:** Does not exist yet. We will need to create this file from scratch, utilizing the exported helpers from `e2e/tui/helpers.ts` (e.g., `launchTUI`, `TERMINAL_SIZES`, `WRITE_TOKEN`, `API_URL`, `OWNER`).

## 5. Implementation Strategy

1.  **Upgrade `APIClientProvider`:** Modify `apps/tui/src/providers/APIClientProvider.tsx`. Since `@codeplane/ui-core` is missing from `package.json`, I will inline `createAPIClient` and `NetworkError` inside `APIClientProvider.tsx`, marking them with `// TODO(ui-core)` for future extraction.
2.  **Create Shared Types:** Scaffold `apps/tui/src/hooks/data/types.ts` with the `Repository` and `APIRequestOptions` interfaces, and implement `parseRepository(raw)`.
3.  **Implement Fetch Wrapper:** Create `apps/tui/src/hooks/data/useTUIFetch.ts` using `useAPIClient` and `useAuth` to intercept 401s and 429s as requested by the spec.
4.  **Implement Specific Hooks:** Create `useRepo.ts`, `useRepos.ts`, `useRepoReadme.ts`, `useStarRepo.ts`, and `useClipboard.ts` using the provided specification blueprints.
5.  **Export the Hooks:** Set up `apps/tui/src/hooks/data/index.ts` and update `apps/tui/src/hooks/index.ts` to expose the new implementations.
6.  **Create E2E Tests:** Add the `e2e/tui/repository.test.ts` to fulfill all testing acceptance criteria.
7.  **Run Checks:** Ensure TypeScript compilation via `bun run check`.