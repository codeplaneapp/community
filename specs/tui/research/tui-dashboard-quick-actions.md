# TUI Dashboard Quick Actions Bar Research Findings

## 1. Directory Structure & Dashboard State
- **Target Directory:** `apps/tui/src/screens/Dashboard/` does not currently exist. The dashboard screen dependency appears to be stubbed via `PlaceholderScreen` in the router registry. Implementing this ticket will require creating the directory structure (`constants.ts`, `hooks/`, `components/`, etc.) from scratch or collaborating with the `tui-dashboard-screen` ticket implementation.
- **Router Extension Required:** The `ScreenName.RepoCreate` enum value and registry entry are indeed missing from `apps/tui/src/router/types.ts` and `apps/tui/src/router/registry.ts`. They will need to be added as specified in the productionization notes, routing to `PlaceholderScreen`.

## 2. OpenTUI `<box>` Border API (Correction to Spec)
- The engineering spec suggests using boolean props for individual borders: `borderTop={true} borderBottom={false} borderLeft={false} borderRight={false}`.
- **Finding:** OpenTUI's `BoxProps` and `BoxRenderable` do **not** accept these properties. Instead, the `border` prop accepts either a boolean or an array of sides: `border: boolean | BorderSides[]` where `BorderSides` is `"top" | "right" | "bottom" | "left"`.
- **Implementation Requirement:** The bar should be rendered with `border={["top"]}` instead of `borderTop={true}`.

## 3. Theme & Text Attributes
- **Tokens:** `theme.border`, `theme.muted`, and `theme.warning` are correctly defined in `apps/tui/src/theme/tokens.ts`.
- **Text Styling:** The `TextAttributes` constant in `theme/tokens.ts` provides `TextAttributes.BOLD` (value `1`). This can be passed to the `attributes` prop of the `<text>` component: `<text attributes={TextAttributes.BOLD}>...</text>`.
- OpenTUI's `<text>` component natively handles nested React fragments and strings, which matches the preferred rendering pattern outlined in the spec.

## 4. Go-To Mode Suppression
- **Go-To Mode State:** The `KeybindingProvider` (in `apps/tui/src/providers/KeybindingProvider.tsx`) does **not** currently expose an `isGoToModeActive` flag or a `hasActiveGoTo()` method.
- **Current Implementation:** In `apps/tui/src/components/GlobalKeybindings.tsx`, the `onGoTo` action is currently a stub (`/* TODO: wired in go-to keybindings ticket */`).
- **Conclusion:** As the go-to mode is not fully wired, the priority-based interception (Option B) is the correct path. We do not need to implement custom state in the provider right now, as `PRIORITY.GOTO` (3) will naturally intercept overlapping keys before `PRIORITY.SCREEN` (4) once go-to mode is fully implemented.

## 5. End-to-End Tests
- **Test File:** `e2e/tui/dashboard.test.ts` does not exist and must be created entirely for this ticket.
- **Test Helpers:** `launchTUI`, `TERMINAL_SIZES`, and `TUITestInstance` are available in `e2e/tui/helpers.ts` to support the required SNAP-QA, KEY-QA, RESP-QA, and INT-QA tests.