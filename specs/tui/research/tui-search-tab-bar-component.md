# Codebase Research: `tui-search-tab-bar-component`

## 1. Directory and File Status
- **Target Directory:** `apps/tui/src/screens/Search/` currently does NOT exist and must be created.
- **Test File:** `e2e/tui/search.test.ts` currently does NOT exist and must be created.

## 2. Dependencies and Existing Code Patterns

### `useLayout` and `Breakpoint`
- **Export Paths:** 
  - `import { useLayout } from "../../hooks/useLayout.js";` (or `"../../hooks/index.js"`)
  - `import type { Breakpoint } from "../../types/breakpoint.js";`
- **Implementation Detail:** 
  - `useLayout()` returns an object containing `{ breakpoint: Breakpoint | null, width, height, ... }`.
  - `Breakpoint` is strictly typed as `"minimum" | "standard" | "large"` in `apps/tui/src/types/breakpoint.ts`.
  - Pattern: `breakpoint` can be `null` if the terminal is too small (below `80x24`), matching the design spec expectation to fall back to `"minimum"` defensively.

### `useTheme` and `TextAttributes`
- **Export Paths:**
  - `import { useTheme } from "../../hooks/useTheme.js";`
  - `import { TextAttributes } from "../../theme/tokens.js";`
- **Implementation Detail:**
  - `useTheme()` returns `ThemeTokens` which include `primary` and `muted` color values natively compatible with `@opentui` components.
  - `TextAttributes` is a freeze object containing bitmask values like `BOLD` and `UNDERLINE`. Used exactly as spec'd: `attributes={TextAttributes.BOLD | TextAttributes.UNDERLINE}`.

### `useSearchTabs` Hook Dependency
- **Status:** The file `apps/tui/src/hooks/useSearchTabs.types.ts` and the `useSearchTabs` hook do NOT exist in the codebase yet. 
- **Action Required:** As noted in the spec dependencies (`tui-search-data-hooks`), `SearchTabId` is expected from this path. The type may need to be stubbed (e.g., `export type SearchTabId = "repos" | "issues" | "users" | "code";`) or created alongside if the dependencies are not met by another active ticket.

### Testing Context (`e2e/tui/helpers.ts`)
- Provides `launchTUI()` function to spin up the headless TUI using `@microsoft/tui-test`.
- Provides `TERMINAL_SIZES` constant:
  - `TERMINAL_SIZES.minimum` (80x24)
  - `TERMINAL_SIZES.standard` (120x40)
  - `TERMINAL_SIZES.large` (200x60)
- Standard TUI instance methods are available (e.g., `await tui.sendKeys("g", "s")`, `tui.snapshot()`, `tui.resize()`, `await tui.waitForText()`) which perfectly map to the requested E2E testing scenarios.