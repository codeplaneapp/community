# Research Findings for `tui-agent-message-block`

## 1. Existing Types and Models (`apps/tui/src/screens/Agents/types.ts`)
The TUI handles agent messages using a discriminated union for `MessagePart` to support pure text, tool calls, and tool results natively. We verified the models match the specification perfectly:

```typescript
export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; input: string }
  | { type: "tool_result"; id: string; name: string; output: string; isError: boolean };

export interface AgentMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  timestamp: string; // ISO-8601
  streaming?: boolean;
}

export type Breakpoint = "minimum" | "standard" | "large";
```

## 2. Formatting Utility (`apps/tui/src/screens/Agents/utils/formatTimestamp.ts`)
The `formatTimestamp` utility calculates elapsed time. Critically, it explicitly returns `null` for the `minimum` breakpoint and abbreviated outputs like `<1m` or `3m` for `standard`, and verbose strings like `3 minutes ago` for `large` breakpoints.

## 3. Theme & Syntax Infrastructure (`apps/tui/src/lib/diff-syntax.ts`)
The current codebase implements terminal coloring via semantic roles mapping down to `@opentui/core`'s `RGBA` abstractions. It defines three tier palettes: `TRUECOLOR_PALETTE`, `ANSI256_PALETTE`, and `ANSI16_PALETTE`. The implementation logic uses a module-level color detector `detectColorTier()` mapping these based on `$COLORTERM` and `$TERM`.

OpenTUI primitives generally require `SyntaxStyle.fromStyles()` generated instances to handle tree-sitter color mappings for Markdown and Code blocks. Because `diff-syntax.ts` defines `getPaletteForTier()`, creating our `apps/tui/src/theme/syntaxStyle.ts` as a process-level singleton using these styles will work seamlessly without duplicating the palette declarations.

## 4. OpenTUI Open Source API (`context/opentui/packages/core/src/renderables/Markdown.ts` and `jsx-namespace.d.ts`)

### `MarkdownOptions`
The `MarkdownOptions` interface enforces strict options. We noted the following core requirements:
- `content?: string`: the markdown payload.
- `syntaxStyle: SyntaxStyle`: strictly required parameter (which our singleton will satisfy).
- `streaming?: boolean`: directly enables streaming mode for incremental updates with incomplete token structures. As designed, trailing blocks will remain unstable until we flag this boolean to `false` when SSE finishes.

### OpenTUI JSX React Namespace (`jsx-namespace.d.ts`)
OpenTUI augments the React JSX namespace to include terminal-specific nodes:
- Layout: `box`, `scrollbox`
- Text nodes: `text`, `span`, `b`, `i`, `u`, `strong`, `em`
- Blocks: `code`, `diff`, `markdown`

The `b` and `em` elements extend `SpanProps` mapping internally to `TextModifierRenderable`, accepting `fg` as an `RGBA | string` natively. This means we can write `<text fg={COLORS.success}><b>Agent</b></text>` directly without manual `TextAttributes.BOLD` bitmasking.

## 5. Hook and Terminal Management
Terminal dimensions are destructured from `@opentui/react`'s `useTerminalDimensions()` hook (`const { width, height } = useTerminalDimensions()`). The specification uses this `width` combined with our dynamic `PADDING_CONFIG` to calculate the exact count of repeated `─` characters for the visual separator.

## 6. Implementation Readiness
Everything necessary to build out `ToolBlock`, `MessageBlock`, `colors.ts`, `generateSummary.ts`, and `syntaxStyle.ts` exists inside the `apps/tui/src/screens/Agents` module folder. We have confirmed all types, utility functions, OpenTUI component expectations, and hook patterns are available and correct.