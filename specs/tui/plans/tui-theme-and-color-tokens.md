# Implementation Plan: TUI_THEME_AND_COLOR_TOKENS

This document outlines the step-by-step plan to finalize the Codeplane TUI theme and color token system, migrating away from hardcoded colors, centralizing color detection, and adding comprehensive E2E tests based on the engineering spec and research findings.

## 1. Remove Hardcoded Colors Outside Theme Context

**Target Files:**
- `apps/tui/src/components/ErrorBoundary.tsx`
- `apps/tui/src/components/TerminalTooSmallScreen.tsx`

**Actions:**
1. Import `detectColorCapability` from `../theme/detect.js` and `createTheme`, `TextAttributes` from `../theme/tokens.js` in both files.
2. Instantiate a module-level fallback theme: `const fallbackTheme = createTheme(detectColorCapability());`.
3. In `ErrorBoundary.tsx`, replace `fg="#DC2626"` with `fg={fallbackTheme.error}` and `fg="#A3A3A3"` with `fg={fallbackTheme.muted}`. Replace `attributes={1}` with `attributes={TextAttributes.BOLD}`.
4. In `TerminalTooSmallScreen.tsx`, replace `fg="#CA8A04"` with `fg={fallbackTheme.warning}` (or similar semantic mapping) and `#A3A3A3` with `fg={fallbackTheme.muted}`.

## 2. Unify Color Detection (`diff-syntax.ts` Migration)

**Target Files:**
- `apps/tui/src/lib/diff-syntax.ts`
- `apps/tui/src/theme/syntaxStyle.ts`
- `apps/tui/src/theme/index.ts`

**Actions:**
1. In `apps/tui/src/lib/diff-syntax.ts`, remove the local `detectColorTier()` definition.
2. Import `detectColorCapability` and `ColorTier` from `../theme/detect.js`.
3. Export it as an alias for backward compatibility: `export const detectColorTier = detectColorCapability;` and `export type { ColorTier };`.
4. In `apps/tui/src/theme/syntaxStyle.ts`, update the import to use `detectColorCapability` from `./detect.js` instead of `detectColorTier` from `diff-syntax`.
5. In `apps/tui/src/theme/index.ts`, ensure `detectColorTier` is exported as an alias of `detectColorCapability`.

## 3. Migrate Agent Screen Colors

**Target Files:**
- `apps/tui/src/screens/Agents/components/colors.ts` (to be deleted)
- `apps/tui/src/screens/Agents/AgentSessionReplayScreen.tsx`
- `apps/tui/src/screens/Agents/components/ToolBlock.tsx`
- `apps/tui/src/screens/Agents/components/MessageBlock.tsx`
- `apps/tui/src/screens/Agents/components/SessionSummary.tsx`
- `apps/tui/src/screens/Agents/AgentChatScreen.tsx`

**Actions:**
1. Delete `apps/tui/src/screens/Agents/components/colors.ts`.
2. In all 5 consumer files, remove imports of `COLORS` and `COLOR_TIER`.
3. Import `useTheme` from `hooks/useTheme.js` (or relative paths) and `useColorTier` from `hooks/useColorTier.js`.
4. Inside the component bodies, add `const theme = useTheme();` and `const tier = useColorTier();`.
5. Replace usage of `COLORS.primary` with `theme.primary`, `COLORS.success` with `theme.success`, etc.

## 4. Enhance HeaderBar Component

**Target File:** `apps/tui/src/components/HeaderBar.tsx`

**Actions:**
1. Import `statusToToken` from `../theme/tokens.js`.
2. Add a `borderColor={theme.border}` and `border={["bottom"]}` to the outer `<box>`.
3. Update the breadcrumb rendering so the last segment uses `attributes={TextAttributes.BOLD}` (default foreground) while previous segments use `theme.muted`.
4. Update the repo context rendering to use `fg={theme.primary}`.
5. Dynamically color the connection dot using `theme[statusToToken(connectionStatus)]`.
6. Add a notification badge next to the connection status (if `unreadCount > 0`) using `fg={theme.primary}`.

## 5. Enhance StatusBar Component

**Target File:** `apps/tui/src/components/StatusBar.tsx`

**Actions:**
1. Import `statusToToken` from `../theme/tokens.js`.
2. Add a `borderColor={theme.border}` and `border={["top"]}` to the outer `<box>`.
3. Update the keybinding hints text: wrap the keys (`j/k`, `Enter`, `q`, `?`) in `<text fg={theme.primary}>` and their descriptions in `<text fg={theme.muted}>`.
4. Dynamically style the sync status using `theme[statusToToken(syncState)]`.
5. Make sure the `? help` section also highlights the `?` in `theme.primary`.

## 6. Verify `NO_COLOR` Bootstrap Handling

**Target File:** `apps/tui/src/index.tsx`

**Actions:**
1. Inspect the `createCliRenderer` setup to ensure it correctly cascades the `ansi16` fallback behaviors natively provided by `detectColorCapability` when `NO_COLOR=1` or `TERM=dumb` is active.
2. (No strict code changes are anticipated here if OpenTUI handles standard SGR suppression correctly for `ansi16`, but keeping it in the checklist for verification).

## 7. Comprehensive E2E and Unit Tests

**Target File:** `e2e/tui/app-shell.test.ts`

**Actions:**
Append the following `describe` blocks exactly as specified in the engineering plan to validate all token integrations:
1. **Color Detection:** `THEME_TIER_01` to `04`.
2. **Theme Token Application:** `THEME_SNAPSHOT_01` to `06` (HeaderBar, StatusBar, focused lists, modal overlays, issue statuses).
3. **NO_COLOR and TERM=dumb:** `THEME_NOCOLOR_01` and `02`.
4. **Keyboard Interaction:** `THEME_KEY_01`, `03`, `04` (focus highlights, help overlay, Esc dismissal).
5. **Responsive Size:** `THEME_RESPONSIVE_01` to `05` (colors survive minimum, standard, large, and resize events).
6. **Error States:** `THEME_ERROR_01` to `04` (ErrorBoundary, network errors, auth errors, SSE disconnects).
7. **Consistency:** `THEME_CONSISTENCY_01` to `05` (no hardcoded strings, loading states, deleted `colors.ts`, ANSI fallback readability).
8. **Token System Unit Tests:** `THEME_UNIT_01` to `06` using `bunEval` to test `statusToToken` mappings, object referential stability, and token structures.

*(Note: Tests relying on unimplemented APIs will fail, which is the expected and desired behavior as per the Codeplane testing philosophy).* 
