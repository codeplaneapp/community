# Implementation Plan: `tui-agent-message-block`

This implementation plan details the steps to build the shared `MessageBlock` and `ToolBlock` components for agent message rendering in the Codeplane TUI. These components are pure presentational UI elements using `@opentui/react` primitives and semantic coloring based on terminal capabilities.

## Step 1: Create `apps/tui/src/theme/syntaxStyle.ts`

Create a process-level singleton for syntax styling to be used across markdown and code renderers.

**File:** `apps/tui/src/theme/syntaxStyle.ts`

1.  Create the `apps/tui/src/theme/` directory if it doesn't exist.
2.  Import `SyntaxStyle` from `@opentui/core`.
3.  Import `getPaletteForTier` and `detectColorTier` from `../lib/diff-syntax.js`.
4.  Detect the current color tier: `const tier = detectColorTier();`.
5.  Resolve the palette: `const palette = getPaletteForTier(tier);`.
6.  Export the singleton: `export const defaultSyntaxStyle = SyntaxStyle.fromStyles(palette);`.

## Step 2: Implement Shared Color Constants

Create a centralized, interim color token map resolving to appropriate `@opentui/core` `RGBA` values based on the terminal's color support tier.

**File:** `apps/tui/src/screens/Agents/components/colors.ts`

1.  Import `RGBA` from `@opentui/core` and `{ detectColorTier, type ColorTier }` from `../../../lib/diff-syntax.js`.
2.  Implement `resolveColors(tier: ColorTier)` returning the exact token mappings (`primary`, `success`, `warning`, `error`, `muted`, `border`) for `truecolor`, `ansi256`, and `ansi16` tiers as described in the spec.
3.  Export `COLOR_TIER = detectColorTier();`.
4.  Export `COLORS = resolveColors(COLOR_TIER);`.
5.  Add `// TODO(ThemeProvider): Replace COLORS with useTheme()` comment to flag for future migration.

## Step 3: Implement Content Summarization Utility

Provide logic for summarization to be used by collapsed tool blocks.

**File:** `apps/tui/src/screens/Agents/utils/generateSummary.ts`

1.  Define and export `SUMMARY_LIMIT` constant mapping `minimum` to `null`, `standard` to `60`, and `large` to `120`.
2.  Implement `generateSummary(content: string, breakpoint: Breakpoint): string | null`.
3.  Handle truncation: strip newlines, check against `SUMMARY_LIMIT[breakpoint]`, and append `…` if the length exceeds the limit.
4.  Return `null` for the `minimum` breakpoint or if content is completely empty/whitespace.

## Step 4: Build `ToolBlock` Component

Build the UI component for rendering tool calls and results.

**File:** `apps/tui/src/screens/Agents/components/ToolBlock.tsx`

1.  Define the discriminated `ToolBlockProps` union for `call` vs. `result` variants enforcing correct payload properties via `never` typing.
2.  Implement file-local `truncateContent` (64KB size limit, appending truncation notice) and `truncateToolName` (50 chars limit, appending `…`).
3.  Define `UNICODE_INDICATORS` (`▶`, `▼`, `✓`, `✗`) and `ASCII_INDICATORS` (`>`, `v`, `+`, `x`), conditionally selecting based on `COLOR_TIER === "ansi16"`.
4.  Implement the collapsed state layout using `<box flexDirection="row">` combining indicators, bold warning-colored tool name, and muted generated summary.
5.  Implement the expanded state layout displaying input via `<code filetype="json">` for calls, and either `<markdown>` or raw error `<text>` for results depending on `isError`.
6.  Wrap the final component in `React.memo` for performance and export.

## Step 5: Build `MessageBlock` Component

Build the core message component routing over message parts and applying padding and separator logic.

**File:** `apps/tui/src/screens/Agents/components/MessageBlock.tsx`

1.  Implement `useSpinner(active: boolean)` hook cycling through `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` braille frames using a `setInterval` of 100ms returning empty string when inactive.
2.  Define `LABEL_CONFIG` and `PADDING_CONFIG` for the `minimum`, `standard`, and `large` breakpoints.
3.  Implement `renderRoleLabel` rendering `<text>` wrapping `<b>` or `<em>` tags populated with role names based on the defined `COLORS`.
4.  Calculate `separatorWidth` using `@opentui/react`'s `useTerminalDimensions().width` minus left/right padding and render the separator `<box>` using `COLORS.border`.
5.  Map over `message.parts`: render `<markdown>` for text parts, computing the `streaming` prop to pass `true` only for the *last* text part of an assistant message if `message.streaming` is truthy.
6.  Render `ToolBlock` elements corresponding to `tool_call` and `tool_result` passing through `expandedToolIds` logic.
7.  Wrap the final component in `React.memo` and export.

## Step 6: Expose Components via Barrel Export

Ensure clear imports for the module consumption.

**File:** `apps/tui/src/screens/Agents/components/index.ts`

1.  Add `export * from "./colors.js";`.
2.  Ensure existing `export * from "./MessageBlock.js";` and `export * from "./ToolBlock.js";` exist.
3.  Run `bun run check` in `apps/tui/` to verify type safety and strict mode FFI bounds.

## Step 7: Author End-to-End Tests

Add robust `@microsoft/tui-test` specifications covering snapshots, interaction, and responsiveness.

**File:** `e2e/tui/agents.test.ts`

1.  Import `createTestTui` from `@microsoft/tui-test`.
2.  Wrap all tests in `describe("TUI_AGENT_MESSAGE_BLOCK", () => { ... })`.
3.  Implement 14 terminal snapshot assertions spanning breakpoints (`80x24`, `120x40`, `200x60`) and states (streaming, collapsed/expanded tools).
4.  Implement 10 keyboard interaction tests focusing on `x`, `X`, and `Enter` sequences to toggle `ToolBlock` instances, ensuring expanded states persist through resize and scrolling.
5.  Implement 8 responsive layout tests specifically validating the collapse of timestamps/summaries and the abbreviation of labels (`Y:` / `A:`).
6.  Implement 6 edge-case tests validating unicode fidelity, >64KB truncation enforcement, and unknown message part recovery.
7.  Do not comment out failing backend-dependent tests; strictly adhere to failing-forward validation.