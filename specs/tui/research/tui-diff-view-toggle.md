# Research Findings: Codeplane TUI Diff View Toggle

Based on an analysis of the Codeplane TUI repository (`apps/tui/`) and OpenTUI context (`context/opentui/`), here are the comprehensive findings relevant to implementing the `TUI_DIFF_VIEW_TOGGLE` feature.

## 1. OpenTUI Diff Component API

Found in: `context/opentui/packages/web/src/content/docs/components/diff.mdx`

The `<diff>` component (mapped via `@opentui/react` from `DiffRenderable` in `@opentui/core`) supports the exact properties needed for the split/unified view toggle. The key properties for this feature include:

*   `view`: Accepts `"unified"` or `"split"`. Default is `"unified"`.
*   `diff`: The unified diff string data.
*   `showLineNumbers`: Boolean to toggle line numbers.
*   `addedBg`, `removedBg`, `addedSignColor`, `removedSignColor`: Theme customization variables.

Additionally, OpenTUI supports the `syncScroll` prop to synchronize the scrolling behavior between the left and right viewports.

Similarly, `packages/ui-core/` which is mentioned in the PRD is not present locally in the `packages/` directory, implying we will rely purely on mock or predefined data types for `DiffData` in the local hook implementation rather than consuming an external hook if we're building the scaffold.

## Summary for Implementation

*   **State Management:** Create `useDiffViewToggle` hook to manage `"unified" | "split"`, integrating `useTerminalDimensions` and a `100ms` debounce.
*   **Flash Messages:** Use `StatusBarHintsContext.overrideHints` with `setTimeout` to push full-width warning hints to the bottom screen.
*   **Keybinding Integration:** Provide the toggle handler to `buildDiffKeybindings` via the existing `t` key mapped into `useScreenKeybindings`.
*   **Scroll Preservation:** Utilize OpenTUI Refs recursively down to `.leftCodeRenderable.scrollY` inside the `<diff>` primitive to capture and re-apply logical scroll location synchronously across state updates.