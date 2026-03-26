# Research Findings: `tui-repo-file-preview`

## 1. Syntax Highlighting & Styling
- **Existing Pattern:** The file `apps/tui/src/hooks/useDiffSyntaxStyle.ts` provides a clear template for instantiating OpenTUI's `SyntaxStyle`. It uses `createDiffSyntaxStyle` and `detectColorTier` from `apps/tui/src/lib/diff-syntax.ts`. 
- **Implementation Detail:** It caches the native `SyntaxStyle` instance via a `useRef` and carefully handles its destruction on unmount (`styleRef.current.destroy()`). We can mimic this directly for `useCodeSyntaxStyle` (and initially re-use `createDiffSyntaxStyle` since the underlying tokens are largely identical).
- **Lib context:** `apps/tui/src/lib/diff-syntax.ts` defines comprehensive palettes (`TRUECOLOR_PALETTE`, `ANSI256_PALETTE`, `ANSI16_PALETTE`) for syntax tokens like `keyword`, `string`, `function`, etc. 

## 2. OpenTUI Components
- **`<code>` Component:** 
  - Based on `context/opentui/packages/core/src/renderables/Code.ts`, the `CodeOptions` interface supports `content`, `filetype`, `syntaxStyle`, and `streaming`.
  - Example usage from `context/opentui/packages/react/examples/code-demo.tsx` confirms we can pass these props directly: `<code content={codeExample} filetype="javascript" syntaxStyle={syntaxStyle} />`.
  - The `CodeRenderable` includes options to enable line numbers via wrapping components like `<line-number>` or by placing a separate gutter `<box>` next to it, as outlined in the spec.
- **`<markdown>` Component:**
  - Based on `context/opentui/packages/core/src/renderables/Markdown.ts`, `MarkdownOptions` similarly accepts `content`, `syntaxStyle`, and `streaming`.
  - Note that `streaming` is available but the spec mentions we shouldn't use it for standard file previews as full content is already loaded.

## 3. Directory Structure & Scaffold State
- **Screens:** The directory `apps/tui/src/screens/` currently only contains `Agents/` and `PlaceholderScreen.tsx`. There is no `Repository` folder or `CodeExplorerTab.tsx` yet. This means we will need to create the scaffolding for `screens/Repository/CodeExplorerTab.tsx` as part of this implementation.
- **Shared Packages:** A lookup for `packages/ui-core/` and `apps/ui/` resulted in `ENOENT`. Since this workspace is partially stubbed, the mocked hook return `UseFileContentReturn` will likely need to be provided directly or stubbed based on the types mentioned in the spec (`tui-repo-tree-hooks`), relying on the `501 Not Implemented` placeholder state for tests.

## 4. Clipboard API
- A search for `clipboard` and `useClipboard` across `apps/tui/src/` returned zero matches.
- This confirms that the cross-platform clipboard hook (supporting `pbcopy`, `wl-copy`, `xclip`, `osc52`, etc.) must be built entirely from scratch according to the implementation steps, utilizing `Bun.which()` for binary discovery.

## 5. Next Steps
- Create `util/file-metadata.ts` for file parsing utilities.
- Create `useClipboard.ts`, `useFileSearch.ts`, and `useCodeSyntaxStyle.ts` following existing patterns in `apps/tui/src/hooks/`.
- Assemble the UI components (`FilePreviewHeader.tsx`, `FilePreviewBody.tsx`, and `FilePreviewPanel.tsx`) using OpenTUI's layout primitives and the `<code>`/`<markdown>` elements.
- Mock the `CodeExplorerTab.tsx` to host the preview and inject stubbed `useFileContent` return values to allow tests to run against the error state.