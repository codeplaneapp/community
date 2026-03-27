# Research Findings: Codeplane TUI Dashboard Orgs List

## 1. Directory Structure Status

- **Dashboard Screen (`apps/tui/src/screens/Dashboard`)**: Does not currently exist in the main branch. The engineering plan mentions mounting `OrgsPanel` inside `DashboardScreen`. If implementing before `tui-dashboard-screen-scaffold`, you will need to scaffold the screen and router registration, or test via a local sandbox.
- **Data Hooks (`packages/ui-core/`)**: This package is currently missing from the tree (only `packages/sdk` and `packages/workflow` are present). The `useOrgs` hook and `APIClientProvider` dependencies (from `tui-dashboard-data-hooks`) will need to be locally stubbed if you begin implementation before that ticket is merged.

## 2. Shared Hooks & State Management

### Responsive Layout (`apps/tui/src/hooks/useResponsiveValue.ts` & `useLayout.ts`)
- **`useResponsiveValue<T>`**: Maps breakpoint keys (`minimum`, `standard`, `large`) to specific values. Matches the spec's requirement for responsive columns `useResponsiveValue(ORG_COLUMNS)`.
- **`useLayout`**: Exposes `{ width, height, breakpoint, ... }` via `@opentui/react`'s `useTerminalDimensions()`. This is useful for passing telemetry values and computing explicit component dimensions.

### Theme (`apps/tui/src/hooks/useTheme.ts`)
- **`useTheme()`**: Provides frozen semantic theme tokens for colors (`primary`, `success`, `warning`, `error`, `muted`, etc.). It guarantees stable references that won't trigger re-renders when used in dependencies.

### Pagination (`apps/tui/src/hooks/usePaginationLoading.ts`)
- Provides the `usePaginationLoading` hook required by the spec. 
- Takes `{ screen: string, hasMore: boolean, fetchMore: () => Promise<void> }`.
- Returns `{ status, error, loadMore, retry, spinnerFrame }`.
- Handles deduplication of in-flight requests and debounced retries, making the implementation of `loadMore` clean and standardized.

## 3. UI Components

### Pagination Indicator (`apps/tui/src/components/PaginationIndicator.tsx`)
- Readily available inline component for the bottom of `<scrollbox>`.
- Accepts `{ status, spinnerFrame, error }` directly from the `usePaginationLoading` hook.
- Handles "Loading more…" states and standard rate-limit/HTTP error states autonomously.

### Text Utilities (`apps/tui/src/util/truncate.ts`)
- **`truncateText(text, maxWidth)`**: Takes text and truncates it with an ellipsis `…` character if the text exceeds the `maxWidth` column boundary. Safe to use immediately, but keep the `Intl.Segmenter` (grapheme-aware) update in mind for productionization (step 10.1 of spec).

## 4. Telemetry & Logging

- The library exports are available at `apps/tui/src/lib/telemetry.ts` and `apps/tui/src/lib/logger.ts`.
- Ensure `emit("tui.dashboard.orgs.*", payload)` and `logger.info(...)` align exactly with the payload schemas required by the spec.

## 5. E2E Testing Context (`e2e/tui/helpers.ts`)

- Tests utilize `launchTUI({ cols, rows, env })` to spin up isolated, headless TUI processes backed by a real PTY via `@microsoft/tui-test`.
- Returned `TUITestInstance` provides `sendKeys("j", "Tab", "G")`, `waitForText()`, `waitForNoText()`, and `snapshot()` for assertions.
- Test files map to feature groups, so `e2e/tui/dashboard.test.ts` should be created to house the specified 63 snapshot, interaction, responsive, and integration tests. 