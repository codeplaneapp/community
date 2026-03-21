# Research Findings: TUI Loading States

## 1. Existing Directory Structure
- `apps/tui/src/loading` does **not** exist yet. All types, constants, and the barrel export will need to be created from scratch in this new directory.
- `apps/tui/src/components`, `hooks`, `providers`, `util`, and `theme` all exist with their respective `index.ts` barrel files. We will need to append our new exports to these existing barrel files.

## 2. Dependency Modules
### `tui-spinner-hook` (`apps/tui/src/hooks/useSpinner.ts`)
- **Status**: Implemented and matches the specification.
- **Details**: Exports `useSpinner(active: boolean): string`. It handles the OpenTUI `Timeline` engine logic, tracking `activeCount`, and returning either the current braille/ASCII frame character or an empty string `""` when inactive. It uses `isUnicodeSupported()` internally.

### `tui-theme-provider` (`apps/tui/src/theme/tokens.ts`, `apps/tui/src/hooks/useTheme.ts`)
- **Status**: Implemented.
- **Details**: `useTheme()` returns an object with semantic color tokens like `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`, etc. 

### `tui-layout-hook` (`apps/tui/src/hooks/useLayout.ts`)
- **Status**: Implemented.
- **Details**: `useLayout()` returns `width`, `height`, `breakpoint`, `contentHeight`, `sidebarVisible`, `sidebarWidth`, `modalWidth`, and `modalHeight`.

### `tui-util-text` (`apps/tui/src/util/text.ts`)
- **Status**: Implemented.
- **Details**: Provides string utilities, most importantly `truncateRight(text: string, maxWidth: number): string` which we need for padding and truncating loading labels/errors.

### `tui-e2e-test-infra` (`e2e/tui/helpers.ts` & `e2e/tui/app-shell.test.ts`)
- **Status**: Implemented.
- **Details**: `helpers.ts` provides `launchTUI`, `TUITestInstance`, and `createMockAPIEnv`. The `e2e/tui/app-shell.test.ts` file is massive and contains various `describe` blocks. We will append the new `describe("TUI_LOADING_STATES", ...)` block directly to this file.

## 3. Integration Targets & Architectural Constraints
### `apps/tui/src/index.tsx` vs `apps/tui/src/components/AppShell.tsx`
**CRITICAL OBSERVATION**: The engineering specification contains a contradiction regarding where `LoadingProvider` should be placed.
- **Step 2** states: "Integration point — update provider stack in `apps/tui/src/index.tsx`" and shows `LoadingProvider` wrapping `GlobalKeybindings`.
- **Step 15** states: "The `LoadingProvider` is added to `AppShell.tsx` wrapping the content area" and shows `<LoadingProvider>` wrapping the elements *inside* `AppShell`.
- **Step 16** dictates that `GlobalKeybindings.tsx` must be modified to use `const { retryCallback } = useLoading();` to trigger retries via the `R` key.

**Resolution**: Since `GlobalKeybindings` calls `useLoading()`, it **MUST** be a child of `LoadingProvider`. Thus, `LoadingProvider` must be added to the provider stack in `apps/tui/src/index.tsx` (wrapping `GlobalKeybindings`), and **NOT** inside `AppShell.tsx`. We will place `LoadingProvider` right above `GlobalKeybindings` in `index.tsx`, avoiding the `AppShell.tsx` wrap entirely. 

The current `index.tsx` provider stack:
```tsx
<ErrorBoundary>
  <ThemeProvider>
    <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
      <SSEProvider>
        <NavigationProvider initialStack={initialStack}>
          <GlobalKeybindings>
            <AppShell />
          </GlobalKeybindings>
        </NavigationProvider>
      </SSEProvider>
    </AuthProvider>
  </ThemeProvider>
</ErrorBoundary>
```
We will inject `<LoadingProvider>` such that it wraps `<GlobalKeybindings>`.

### `apps/tui/src/components/StatusBar.tsx`
- Currently, this component uses `useLayout` and `useTheme` to render basic keybinding hints and sync status.
- It needs modification to conditionally render `statusBarError` in red (`theme.error`) and append `R retry` to keybinding hints when `showRetryHint` is true.

### `apps/tui/src/components/GlobalKeybindings.tsx`
- Currently handles `c` (ctrl), `g` (goto), `q`, and `escape`.
- It uses `useKeyboard(handleKey)` from `@opentui/react`.
- We need to import `useLoading` and modify `handleKey` to intercept `R` or `r` (with `shift`) and invoke the `retryCallback` from the loading context.

## 4. Required Files to Create
We will need to author the following new files exactly as specified:
- `apps/tui/src/loading/types.ts`
- `apps/tui/src/loading/constants.ts`
- `apps/tui/src/loading/index.ts`
- `apps/tui/src/providers/LoadingProvider.tsx`
- `apps/tui/src/hooks/useLoading.ts`
- `apps/tui/src/hooks/useScreenLoading.ts`
- `apps/tui/src/hooks/useOptimisticMutation.ts`
- `apps/tui/src/hooks/usePaginationLoading.ts`
- `apps/tui/src/components/FullScreenLoading.tsx`
- `apps/tui/src/components/FullScreenError.tsx`
- `apps/tui/src/components/SkeletonList.tsx`
- `apps/tui/src/components/SkeletonDetail.tsx`
- `apps/tui/src/components/PaginationIndicator.tsx`
- `apps/tui/src/components/ActionButton.tsx`

## 5. Summary of Findings
The existing scaffolding perfectly supports the proposed loading architecture. The only adjustment to the spec is the resolution of the `LoadingProvider` placement (must be in `index.tsx` so `GlobalKeybindings` can consume the context). I am ready to begin implementation.