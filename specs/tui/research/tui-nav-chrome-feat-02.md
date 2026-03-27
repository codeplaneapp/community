# Research Findings: TUI Header Bar (`tui-nav-chrome-feat-02`)

I have successfully investigated the codebase to gather the necessary context for implementing the TUI Header Bar as described in the specification.

## 1. Existing `HeaderBar.tsx`
- Located at `apps/tui/src/components/HeaderBar.tsx`.
- The current implementation is a partial stub. It uses hardcoded placeholder values for `connectionState = "connected"` and `unreadCount = 0`.
- It relies on `truncateBreadcrumb` from `../util/text.js`, which lacks the rich, per-segment limits requested in the spec.
- It features a bottom border (`border={["bottom"]}`) which adds an unwanted extra row to the layout and will need to be removed to conform to the exactly 1-row spec requirement.
- The UI components correctly import from the shared hooks (`useLayout`, `useTheme`, `useNavigation`).

## 2. Existing `SSEProvider.tsx`
- Located at `apps/tui/src/providers/SSEProvider.tsx`.
- Currently, it is a very basic placeholder: `export function SSEProvider({ children }) { return <SSEContext.Provider value={null}>{children}</SSEContext.Provider>; }`
- The `useSSE(channel)` hook simply returns `null`.
- This file will need to be significantly expanded to provide the new `SSEContextValue` interface (`connectionState`, `unreadCount`, `subscribe`).

## 3. Telemetry and Logging Tools
- Discovered `apps/tui/src/lib/logger.ts` and `apps/tui/src/lib/telemetry.ts`.
- These modules exist and correspond to the `logger` and `emit` functions required by the new `HeaderBar.tsx` implementation for tracking connection drops, badge updates, and render metrics.

## 4. Breadcrumb Utilities
- The specification dictates creating `apps/tui/src/utils/breadcrumb.ts` (plural `utils`).
- The existing codebase uses a singular `util/` directory (`apps/tui/src/util/text.ts` contains the old truncation function).
- A new `utils/` directory will be created to house the `breadcrumb.ts` and its barrel export (`index.ts`), as outlined in the spec.

## 5. E2E Testing Context
- Located `e2e/tui/app-shell.test.ts`.
- The test file contains existing suites for the app shell, layout hooks, and theme configurations. It utilizes testing helpers (`launchTUI`, `TUITestInstance`, `TERMINAL_SIZES`) imported from `./helpers.ts`.
- The new tests for the Header Bar (snapshot, interaction, responsive, and edge-case tests) can be appended cleanly to the end of this file.