# TUI Diff Split View - Research Findings

Based on a comprehensive review of the codebase, here is the relevant context to aid in implementing the `tui-diff-split-view` specification.

## 1. TUI Architecture & Existing Patterns (`apps/tui/src/`)

### Layout & Responsive Design (`hooks/useLayout.ts`)
- Exposes `useLayout()` which returns real-time dimensions (`width`, `height`), `contentHeight`, and layout booleans (`sidebarVisible`).
- Breakpoints are handled seamlessly via `breakpoint` (`"large"`, `"standard"`, or `null` if unsupported).
- Calculations for split panes will directly consume `layout.width`, `layout.sidebarVisible`, and `layout.breakpoint`.

### Theming & Colors (`theme/tokens.ts`)
- Diff-specific semantic tokens are available on the `ThemeTokens` object and retrieved via `useTheme()`.
- Essential diff colors explicitly defined: 
  - `diffAddedBg` / `diffAddedText`
  - `diffRemovedBg` / `diffRemovedText`
  - `diffHunkHeader` (cyan)
  - `muted` / `surface` / `border`
- Components use `fg` and `backgroundColor` with these RGBA token values rather than raw hex/ANSI codes.

### Keybindings (`hooks/useScreenKeybindings.ts`)
- Managed via `useScreenKeybindings(bindings, hints?)`.
- Expects an array of `{ key, description, group, handler }` objects.
- Automatically registers status bar hints based on bindings and applies the correct active scope logic.

### Syntax Highlighting (`hooks/useDiffSyntaxStyle.ts`)
- Provides `useDiffSyntaxStyle()`, returning a persistent `SyntaxStyle` object for OpenTUI `<code>` blocks.
- Manages instantiation and native resource cleanup to avoid memory leaks during diff viewing.

## 2. Diff Parsing & Logic (`specs/tui/apps/tui/src/lib/`)

The essential data structures for rendering the diff have already been scaffolded but currently reside in `specs/tui/apps/tui/src/lib/` and need to be relocated to `apps/tui/src/lib/`.

### `diff-types.ts`
Defines exactly what the OpenTUI split render layer expects:
- `DiffLine`: Object representing line content, type (`"context"`, `"add"`, `"remove"`, `"filler"`), and line numbers.
- `SplitLinePair`: Object grouping left (old file) and right (new file) `DiffLine` structures.
- `ParsedHunk`: Structured hunk data containing `splitPairs`.
- `ParsedDiff`: Holds the array of `ParsedHunk` objects and `splitLeftLineMap` / `splitRightLineMap`.

### `diff-parse.ts`
- Implements `parseDiffHunks()` to transform unified diff patches into the required `ParsedDiff` structures.
- Contains `buildSplitPairs()` which performs the critical insertion of `"filler"` line types to guarantee visual alignment between left and right split panes.

## 3. OpenTUI Framework (`context/opentui/packages/react/src/`)

Reviewing the OpenTUI React package reveals the supported JSX elements necessary for building the custom panes:
- `<box>`: For building flexible horizontal and vertical pane structures (e.g., `<box flexDirection="row">`).
- `<scrollbox>`: Used for the independently rendered but synchronously scrolled left/right diff panes. Exposes `scrollY` and `viewportCulling={true}`.
- `<text>`: For rendering non-highlighted filler lines, basic gutter text, and hunk headers.
- `<code>`: Critical for per-line syntax highlighting, taking `content`, `filetype`, and `syntaxStyle` as props.

## 4. Web UI Patterns (`apps/ui/src/`) & Shared Packages (`packages/ui-core/`)

- The `packages/ui-core/` directory is not currently present in the implementation footprint, suggesting shared API logic and hooks outlined in the design spec may be handled via the existing local `@codeplane/sdk` or mocked locally for this specific frontend implementation phase.
- OpenTUI provides all the view primitives needed to fulfill this specific diff ticket.

## 5. End-to-End Tests (`e2e/tui/`)

- Existing diff test scaffolding is located in `e2e/tui/diff.test.ts`.
- Tests rely on `@microsoft/tui-test` framework and a custom `launchTUI()` helper returning instances capable of taking `.snapshot()`, `.waitForText()`, and sending inputs (`.sendKeys()`).
- Implementing the split view will involve appending the planned test specifications to this existing test file.

## Conclusion

The fundamental components and utilities for building `tui-diff-split-view` exist. Implementation should proceed by copying the `diff-types.ts` and `diff-parse.ts` models to `apps/tui/src/lib/`, constructing the layout components leveraging `useLayout`, `useTheme`, and `useScreenKeybindings`, and finally establishing the custom dual-`<scrollbox>` setup powered by a shared `ScrollSyncContext`.