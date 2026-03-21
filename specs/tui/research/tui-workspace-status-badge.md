# TUI Workspace Status Badge Research Findings

## 1. Upstream Dependencies

The required upstream dependencies for the `WorkspaceStatusBadge` component are already implemented and available in the `apps/tui/src` directory. Their APIs match the expectations outlined in the engineering specification.

### `apps/tui/src/theme/tokens.ts`
- Defines `ThemeTokens` interface, specifying semantic RGBA color tokens.
- Core semantic colors available: `primary`, `success`, `warning`, `error`, `muted`, `surface`, `border`.
- Tokens are pre-allocated and accessed via property lookup.
- The generic `statusToToken()` function exists but is insufficient for workspaces as the spec noted (e.g., `suspended` should map to `muted` instead of `warning`). A custom `STATUS_CONFIG` is indeed necessary.

### `apps/tui/src/hooks/useTheme.ts`
- Exports the `useTheme()` hook, returning a stable, frozen `Readonly<ThemeTokens>` object.
- Example usage: `const theme = useTheme(); const color = theme.success;`

### `apps/tui/src/hooks/useSpinner.ts`
- Exports the `useSpinner(active: boolean)` hook.
- When `active` is `true`, it subscribes to an OpenTUI Timeline-driven frame generator and returns an animated frame string (braille or ASCII).
- When `active` is `false`, it returns an empty string `""` and pauses the subscription, preventing memory/CPU leaks.

### `apps/tui/src/hooks/useLayout.ts`
- Exports the `useLayout()` hook, returning a `LayoutContext` object.
- Contains a `breakpoint` property with type `Breakpoint | "unsupported"` (`"minimum"`, `"standard"`, `"large"`, or `"unsupported"`).
- This hook is critical for determining when to hide the textual label (at `"minimum"` and `"unsupported"` breakpoints).

### `apps/tui/src/theme/detect.ts`
- Exports `isUnicodeSupported()`, which checks `TERM` and `NO_COLOR` environment variables to determine if Unicode characters (like `●` and braille patterns) can be safely rendered.
- Used to fall back to an ASCII `*` dot when `isUnicodeSupported()` returns `false`.

## 2. OpenTUI Capabilities

Based on `@opentui/react` and `@opentui/core` references:
- `<text>`: Can accept a text string and an `fg` prop passing the `RGBA` token from `useTheme()`.
- `<box>`: Supports Flexbox-style layout props like `flexDirection="row"`, `gap={1}`, and `alignItems="center"`.

## 3. Directory Structure and Patterns

- The `apps/tui/src/components/` directory does not appear to exist yet based on current globs. It will need to be created along with a barrel export (`index.ts`).
- File extensions in imports follow the `.js` ESM pattern (e.g., `import { useTheme } from "../hooks/useTheme.js"`).
- E2E tests are structured to run via `@microsoft/tui-test`, specifically `launchTUI()` to assert on snapshots and textual output.

## 4. Implementation Readiness

All prerequisites for building the `WorkspaceStatusBadge` exist. The mapping logic defined in the spec perfectly addresses the nuanced requirements for the workspace statuses (e.g., optimistic UI transitional states mapped to animated spinners) without conflicting with any existing generic implementations.