# Research Findings: TUI Diff Unified View

Based on a review of the codebase in `apps/tui/`, `packages/ui-core/`, and `context/opentui/`, here is the relevant context to inform the implementation of `TUI_DIFF_UNIFIED_VIEW`.

## 1. OpenTUI `<diff>` Component

The OpenTUI library provides a native `<diff>` component via `@opentui/react` (and `@opentui/core`).

**Key Prop Interfaces (from `DiffRenderableOptions`):**
- `diff`: A string containing the unified diff patch.
- `view`: `"unified" | "split"`.
- `filetype`: String used for Tree-sitter syntax highlighting resolution.
- `syntaxStyle`: An instance of `SyntaxStyle` (created via `@opentui/core`).
- `wrapMode`: `"word" | "char" | "none"`.
- `showLineNumbers`: Boolean to toggle the gutter.
- **Colors**: `addedBg`, `removedBg`, `contextBg`, `addedSignColor`, `removedSignColor`, `lineNumberFg`, `lineNumberBg`, `addedLineNumberBg`, `removedLineNumberBg`. These accept `string | RGBA`.

## 2. Existing Theme & Styling Patterns

### `useTheme` and `ThemeTokens`
- Found in `apps/tui/src/hooks/useTheme.ts` and `apps/tui/src/theme/tokens.ts`.
- Provides semantic color tokens that map to OpenTUI `RGBA` objects (e.g., `theme.primary`, `theme.success`, `theme.error`, `theme.warning`, `theme.muted`).
- The `DIFF_COLORS` constant described in the spec uses hex codes (`#1a4d1a`, etc.). OpenTUI components automatically accept these string hex codes and parse them internally into RGBA, but `ThemeTokens` are explicitly typed as `RGBA` objects.

### Syntax Highlighting (`useDiffSyntaxStyle`)
- Found in `apps/tui/src/hooks/useDiffSyntaxStyle.ts` and `apps/tui/src/lib/diff-syntax.ts`.
- `useDiffSyntaxStyle` is a React hook that instantiates a `SyntaxStyle` object on mount and cleanly destroys it on unmount using `style.destroy()` to prevent memory leaks.
- Supported color tiers: `truecolor`, `ansi256`, `ansi16`.

## 3. Keybindings and Navigation

### Keybinding Provider
- Found in `apps/tui/src/providers/keybinding-types.ts`.
- Handlers implement the `KeyHandler` interface:
  - `key`: The normalized key string (e.g., `"j"`, `"ctrl+d"`, `"return"`).
  - `description`: Displayed in help menus.
  - `group`: Used to categorize in help menus.
  - `handler`: The function executed on press.
  - `when`: Optional predicate to gate execution (e.g., `() => focusZone === "content"`).
- Priorities are defined via `PRIORITY` (e.g., `PRIORITY.SCREEN = 4`). Keybindings are typically registered at the screen level using `useScreenKeybindings`.

### Status Bar Hints
- The `StatusBarHint` interface allows screens to define context-sensitive hints at the bottom of the screen (`keys`, `label`, `order`).
- These are managed via `StatusBarHintsContextType` or `useScreenKeybindings`.

### Layout and Breakpoints
- Found in `apps/tui/src/types/breakpoint.ts`.
- Defines `Breakpoint` as `"minimum" | "standard" | "large"`.
- The spec dynamically switches `wrapMode` and layout properties based on this value.

## 4. Logging & Telemetry

### Logging
- Found in `apps/tui/src/lib/logger.ts`.
- The logger exports both a `log` function and a `logger` object. The implementation uses `process.stderr.write`.
- Note: The spec code snippet uses `import { log } from "../../lib/logger.js"` and calls `log.warn(...)`. However, in the source file, `log` is a function `log(level: LogLevel, message: string)`, and `logger` is an object with `.warn(msg)`, `.info(msg)`, etc. To match the spec's intent, either the import should be `import { logger as log }` or the spec needs a slight adjustment to use `log("warn", ...)`.

### Telemetry
- Found in `apps/tui/src/lib/telemetry.ts`.
- The module exports `emit(name, properties)` for tracking events. The spec's code snippets refer to a `trackEvent` function. Implementation should alias or update the import: `import { emit as trackEvent } from "../../lib/telemetry.js"`.

## 5. Missing Dependencies

The spec lists several dependencies as required before `TUI_DIFF_UNIFIED_VIEW` can be implemented:
- `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` (`tui-diff-screen-scaffold`)
- `apps/tui/src/lib/diff-parse.ts` (`tui-diff-parse-utils`)
- `apps/tui/src/lib/diff-types.ts` (`tui-diff-parse-utils`)
- `packages/ui-core/src/types/diff.ts`

Searches across `apps/tui/` and `packages/ui-core/` confirmed that these files do not currently exist in the repository. They must be implemented via their respective prerequisite tickets before the `UnifiedDiffViewer` can be successfully compiled and mounted.

## Summary

The foundational libraries (OpenTUI diff renderers, theme providers, keybinding managers, syntax highlighting logic) are robust and match the architecture described in the specification. The missing pieces are entirely isolated to the Diff-specific data parsing and screen scaffolding that precede this ticket in the dependency graph.