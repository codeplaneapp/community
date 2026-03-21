# TUI Theme and Color Tokens Research

## 1. Hardcoded Colors Audit
Searched `apps/tui/src` for hardcoded hex colors (`fg=`, `bg=`, `borderColor=`). Found hardcoded instances in:
- **`apps/tui/src/components/ErrorBoundary.tsx`**: Uses `#DC2626` and `#A3A3A3`. Since this sits outside the ThemeProvider, we must instantiate a module-level fallback theme using `createTheme(detectColorCapability())` and replace these hardcoded strings.
- **`apps/tui/src/components/TerminalTooSmallScreen.tsx`**: Uses `#CA8A04` and `#A3A3A3`. Can also utilize the module-level fallback theme technique or `useTheme()` if it's within the provider stack.

## 2. Agent Screen Colors Migration
- **Target for deletion**: `apps/tui/src/screens/Agents/components/colors.ts` defines duplicated RGB colors.
- **Consumers**: Searched `apps/tui/src/screens/Agents` and found imports in 5 files:
  1. `AgentSessionReplayScreen.tsx`
  2. `components/ToolBlock.tsx` (uses `COLOR_TIER` and `COLORS`)
  3. `components/MessageBlock.tsx`
  4. `components/SessionSummary.tsx`
  5. `AgentChatScreen.tsx`
- **Migration**: All of these components need to be updated to import `useTheme` and `useColorTier` from the respective hooks and use the tokens (e.g. `theme.primary`, `theme.success`).

## 3. diff-syntax.ts Unification
- **`apps/tui/src/lib/diff-syntax.ts`** currently defines its own `detectColorTier()` function that checks `COLORTERM` and `TERM`, but misses `NO_COLOR` and `TERM=dumb` handling.
- **Migration**: Replace local `detectColorTier` definition by importing `detectColorCapability` from `../theme/detect.js` and aliasing it as `detectColorTier`. Re-export `ColorTier` from the theme module as well.
- **`apps/tui/src/theme/syntaxStyle.ts`**: Update the import of `detectColorTier` to point to `detectColorCapability` from `./detect.js`.
- **`apps/tui/src/theme/index.ts`**: Add an alias export for `detectColorTier` pointing to `detectColorCapability` to maintain backwards compatibility if needed.

## 4. HeaderBar Enhancements
- **Current**: Only uses `theme.muted` and `theme.success`.
- **Required Changes**: 
  - Breadcrumbs: Ensure the last segment uses bold formatting (`attributes={TextAttributes.BOLD}`) and defaults foreground, while earlier segments are muted.
  - Repo Context: Update `fg` to `theme.primary`.
  - Connection Status Dot: Integrate `statusToToken(connectionState)` instead of statically using `theme.success`.
  - Notification Badge: Add a badge using `theme.primary`.
  - Border: Add `<box borderColor={theme.border} border={["bottom"]}>` wrapping the header.

## 5. StatusBar Enhancements
- **Current**: Uses `theme.muted` for hints and `theme.success` for sync status.
- **Required Changes**: 
  - Keybindings: Highlight keys (`j/k`, `Enter`, `q`, `?`) using `theme.primary` and their descriptions with `theme.muted`.
  - Sync Status: Make dynamic using `statusToToken(syncState)`.
  - Notification Count: Add if required.
  - Border: Add top border `<box borderColor={theme.border} border={["top"]}>`.

## 6. Bootstrap (`index.tsx`) & Fallbacks
- Color resolution relies entirely on the capability returned by `theme/detect.ts` which successfully maps `NO_COLOR=1` and `TERM=dumb` to `ansi16`.
- Will need to verify if `createCliRenderer` needs any color mode explicit overrides for `NO_COLOR`, though the detection correctly restricts the tier. OpenTUI naturally suppresses unsupported SGRs based on output logic.

## 7. Tests (`app-shell.test.ts`)
- The engineering spec requires a large set of `describe` blocks verifying snapshots, keybindings, responsive sizes, error boundaries, and unit functionality (using `bunEval`).
- Since we need to insert comprehensive E2E tests, I will integrate the described test blocks exactly as documented in the engineering plan into `e2e/tui/app-shell.test.ts`.
