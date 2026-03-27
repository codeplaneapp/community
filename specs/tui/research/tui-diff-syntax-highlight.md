# Research Findings for `tui-diff-syntax-highlight`

## 1. Existing Syntax Infrastructure
The foundation for syntax highlighting was successfully implemented in prior tickets and is ready to use:
- **`apps/tui/src/lib/diff-syntax.ts`**: Provides `TRUECOLOR_PALETTE`, `ANSI256_PALETTE`, `ANSI16_PALETTE`, `resolveFiletype()`, and `createDiffSyntaxStyle(tier: ColorTier)`. It exports `pathToFiletype` from `@opentui/core`.
- **`apps/tui/src/hooks/useDiffSyntaxStyle.ts`**: Provides the `useDiffSyntaxStyle(colorTier?)` hook which returns a stable, memoized `SyntaxStyle | null`. It handles its own cleanup on unmount.

## 2. Theme & Color System
The diff viewer relies on semantic color tokens for syntax highlighting backgrounds and signs:
- **`apps/tui/src/theme/tokens.ts`**: Defines the `ThemeTokens` interface, which includes:
  - `diffAddedBg`
  - `diffRemovedBg`
  - `diffAddedText`
  - `diffRemovedText`
  - `muted` (used for line numbers and guards)

## 4. Scaffold Context
This matches the specification's note that `DiffViewer.tsx` is expected to be scaffolded by `tui-diff-screen-scaffold` and `tui-diff-unified-view`. Depending on execution order, we will either create the directory and `DiffViewer.tsx` or modify them if the preceding ticket just completed.

## 5. Hooks Barrel Export
- **`apps/tui/src/hooks/index.ts`**: Contains exports for all TUI hooks. We need to add:
  ```typescript
  export { useDiffFiletypes } from "./useDiffFiletypes.js";
  export type { ResolvedFileFiletype } from "./useDiffFiletypes.js";
  ```

## 6. OpenTUI `<diff>` Component API
From the spec and OpenTUI context, the `<diff>` component expects:
- `diff`: The raw patch string.
- `view`: `"unified" | "split"`.
- `filetype`: The resolved Tree-sitter language string (or `undefined`).
- `syntaxStyle`: The `SyntaxStyle` instance (or `undefined` if creation failed).
- Theme colors: `addedBg`, `removedBg`, `addedSignColor`, `removedSignColor`, `lineNumberFg`.