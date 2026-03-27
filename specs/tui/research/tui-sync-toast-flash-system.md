# Research Context: Toast and Flash System for Sync Screens

## 1. Theming and Styling (`useTheme`)
* **Hook Path:** `apps/tui/src/hooks/useTheme.ts`
* **Tokens Path:** `apps/tui/src/theme/tokens.ts`
* **Context:** The TUI utilizes a `ThemeTokens` interface. Relevant tokens available for the specified toast/flash variants include `success`, `warning`, `error`, and `muted`. They are retrieved contextually via `const theme = useTheme()`. 

## 2. Layout & Terminal Dimensions
* **Hook Origin:** `import { useTerminalDimensions } from "@opentui/react";`
* **Context:** The hook is imported extensively across the codebase (e.g., `useLayout.ts`, `ErrorScreen.tsx`) and provides the `{ width, height }` of the terminal. This provides the exact primitive needed for the `<Toast>` component to dynamically calculate available space and adhere to the 80-character boundary.

## 3. Text Truncation Utilities
* **Utility Path:** `apps/tui/src/util/text.ts`
* **Context:** The codebase already manages truncation logic using `truncateRight(text: string, maxWidth: number): string`. This function handles proper bounds checking and appends a single-character ellipsis (`…`), which is preferred over manual `...` appending.

## 4. Status Bar Integration (`<Flash />` Target)
* **Target Component:** `apps/tui/src/components/StatusBar.tsx`
* **Context:** Currently, `StatusBar` iterates over `useStatusBarHints()` to render hints in its leftmost box flex layout. The new `useFlash()` state will need to be consumed here to conditionally render the `<Flash />` component instead of standard hints during active flash events.

## 5. E2E Testing Configuration
* **Target File:** `e2e/tui/sync.test.ts`
* **Context:** The file does not currently exist in the `e2e/tui/` directory and will be a new addition. Existing tests (e.g., `e2e/tui/helpers.ts`, `e2e/tui/app-shell.test.ts`) should be leveraged as templates for `launchTUI` parameters and structural testing patterns.