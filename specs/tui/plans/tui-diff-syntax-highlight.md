# Implementation Plan for `tui-diff-syntax-highlight`

This implementation plan details the steps required to wire language-aware Tree-sitter syntax highlighting into the TUI diff viewer. It builds upon the infrastructure established in `tui-diff-syntax-style` (`apps/tui/src/lib/diff-syntax.ts` and `apps/tui/src/hooks/useDiffSyntaxStyle.ts`).

## 1. Create Telemetry and Logging Utilities
**File:** `apps/tui/src/components/diff/diffSyntaxTelemetry.ts`
- Create a new file to encapsulate telemetry events and structured logging for syntax highlighting.
- Define `SyntaxHighlightMetrics` interface.
- Implement `resolveSource` function to determine if the language came from the API, path fallback, or none.
- Implement structured logging functions: `logLanguageResolved`, `logLanguageUnresolved`, `logHighlightTimeout`, `logWorkerError`, and `logColorTierDetected`.
- Use `process.env.DEBUG` to gate debug and info logs. Use `console.warn` for timeouts and worker errors.

## 2. Implement Filetype Resolution Adapter
**File:** `apps/tui/src/components/diff/resolveFileFiletype.ts`
- Create a new file that wraps `resolveFiletype()` from `apps/tui/src/lib/diff-syntax.js`.
- Define a local `FileDiffItem` interface mirroring `@codeplane/ui-core` (until the data hooks ticket is completed).
- Implement `resolveFileFiletype(file: FileDiffItem)`:
  - Guard 1: Return `undefined` if `file.is_binary` is true.
  - Guard 2: Return `undefined` if `file.patch` exists and its `TextEncoder().encode().byteLength` exceeds `1_048_576` (1MB).
  - Fallback: Delegate to `resolveFiletype(file.language ?? undefined, file.path)`.

## 3. Create the `useDiffFiletypes` Hook
**File:** `apps/tui/src/hooks/useDiffFiletypes.ts`
- Create a new hook to resolve filetypes for an array of diff files in batch.
- Define `ResolvedFileFiletype` interface.
- Implement `useDiffFiletypes(files: FileDiffItem[])`:
  - Use `useMemo` on `[files]` to avoid recomputation.
  - Iterate over `files`, calling `resolveFileFiletype` and `resolveSource` for each.
  - Call the appropriate logging function (`logLanguageResolved` or `logLanguageUnresolved`).
  - Return a `Map<string, string | undefined>` keyed by `file.path`.

## 4. Integrate Syntax Highlighting into `DiffViewer`
**File:** `apps/tui/src/components/diff/DiffViewer.tsx`
- Note: If `DiffViewer.tsx` does not exist yet (depending on ticket sequence), scaffold it. Otherwise, modify the existing file.
- Import `useDiffSyntaxStyle`, `useColorTier`, `useDiffFiletypes`, and `logColorTierDetected`.
- Import `useTheme` for semantic color tokens.
- In the `DiffViewer` component:
  - Retrieve `colorTier` via `useColorTier()`.
  - Call `useDiffSyntaxStyle(colorTier)` to get the `syntaxStyle`.
  - Call `useDiffFiletypes(files)` to get the `filetypeMap`.
  - Use a `useEffect` with a `useRef` to log `logColorTierDetected(colorTier)` exactly once on mount.
  - For the currently focused file (`files[focusedFileIndex]`):
    - Render a "Binary file changed" message (with `theme.muted`) if `is_binary`.
    - Render a "File too large to display" message if the patch exceeds 1MB.
    - Render an "Empty file added" message if no patch and additions/deletions are 0.
    - Retrieve the filetype from `filetypeMap`.
    - Pass `filetype` and `syntaxStyle={syntaxStyle ?? undefined}` to the `<diff>` component.
    - Pass theme colors to `<diff>`: `addedBg={theme.diffAddedBg}`, `removedBg={theme.diffRemovedBg}`, `addedSignColor={theme.diffAddedText}`, `removedSignColor={theme.diffRemovedText}`, and `lineNumberFg={theme.muted}`.

## 5. Update Barrel Exports
**File:** `apps/tui/src/components/diff/index.ts`
- Create or update the file to export utilities from `resolveFileFiletype.ts` and `diffSyntaxTelemetry.ts`.

**File:** `apps/tui/src/hooks/index.ts`
- Update the file to export `useDiffFiletypes` and its associated types.

## 6. Implement E2E Tests
**File:** `e2e/tui/diff.test.ts`
- Add E2E tests using `@microsoft/tui-test` to verify syntax highlighting behavior.
- **Snapshot Tests:** Add tests (`SNAP-SYN-001` through `SNAP-SYN-016`) capturing visual states for different languages (TypeScript, JS, Python, Rust, Go, CSS), diff colors (green/red backgrounds vs syntax colors), unknown languages, split vs unified views, minimum terminal size, and hunk headers.
- **Keyboard Interaction Tests:** Add tests (`KEY-SYN-001` through `KEY-SYN-010`) to verify syntax colors persist across view toggles (`t`), file navigation (`[`, `]`), hunk expansion/collapse (`z`, `x`), whitespace toggles (`w`), sidebar toggles (`Ctrl+B`), and scrolling.
- **Responsive Behavior Tests:** Add tests (`RSP-SYN-001` through `RSP-SYN-006`) to ensure highlighting is preserved when resizing across minimum, standard, and large sizes.
- **Data Integration Tests:** Add tests (`INT-SYN-001` through `INT-SYN-010`) covering API language usage, path fallbacks, unrecognized languages, double extensions, basename detection (Dockerfile/Makefile), and guards (binary/oversized files skipping highlighting).
- **Edge Case Tests:** Add tests (`EDGE-SYN-001` through `EDGE-SYN-008`) verifying highlighting doesn't block scrolling, failure isolation, proper cleanup on unmount, fresh style creation on reopen, many-language diff stability, and renamed files using the new path.

*(Note: All backend-dependent E2E tests are designed to remain failing if the backend is not yet implemented, per the testing philosophy).* 