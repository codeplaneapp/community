I will conduct research in the specified directories to gather context for the `tui-diff-syntax-style` engineering specification. My research will focus on identifying existing OpenTUI component usage, React hook patterns, color management, and file type detection mechanisms within the codebase.

My research plan includes:
1. Listing files in `apps/tui/src/` and `context/opentui/` to understand the directory structure.
2. Searching for existing usages of `SyntaxStyle`, `RGBA`, `pathToFiletype` within `apps/tui/` and `context/opentui/` to understand how these OpenTUI primitives are currently used.
3. Investigating how color capabilities are detected from environment variables (`COLORTERM`, `TERM`) in `apps/tui/`.
4. Examining `apps/tui/` for existing React component and hook patterns, especially those related to `OpenTUI` components.
5. Searching `packages/ui-core/` and `apps/tui/` for data structures that might include `language` or `filePath` fields, which are relevant for the `resolveFiletype` function.
6. Looking for any existing `<diff>` component usage in `apps/tui/` to see how `filetype` and `syntaxStyle` might be integrated.

I will present my findings in a structured markdown format.