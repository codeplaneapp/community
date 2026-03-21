# Engineering Specification: `tui-agent-message-block`

## Build shared MessageBlock and ToolBlock components for agent message rendering

**Ticket ID:** `tui-agent-message-block`
**Type:** Engineering
**Estimate:** 8 hours
**Dependencies:** None (pure presentational components; no `@codeplane/ui-core` data hooks consumed or created)
**Consumers:** `AgentChatScreen` (`TUI_AGENT_CHAT_SCREEN`), `AgentSessionReplayScreen` (`TUI_AGENT_SESSION_REPLAY`)

---

## 1. Overview

This ticket delivers two shared React components — `MessageBlock` and `ToolBlock` — that render agent conversation messages in the Codeplane TUI. Both components are used identically by the agent chat screen and the replay screen. They are **pure presentational components**: they receive data and a breakpoint prop, and render terminal UI. They do not fetch data, manage navigation, or hold session-level state.

The components live at:
- `apps/tui/src/screens/Agents/components/MessageBlock.tsx`
- `apps/tui/src/screens/Agents/components/ToolBlock.tsx`

**`@codeplane/ui-core` usage:** Zero. These components are entirely presentational. They consume no data hooks from `@codeplane/ui-core`. The parent screens (`AgentChatScreen`, `AgentSessionReplayScreen`) are responsible for fetching agent session data via `@codeplane/ui-core` hooks (e.g., `useAgentMessages`, `useAgentSession`) and passing materialized `AgentMessage[]` arrays down as props. This separation is intentional — it keeps the rendering components maximally testable and reusable.

**Current state of the repository (as of this spec):**
- ✅ `apps/tui/src/screens/Agents/types.ts` — complete type definitions, matches spec (lines 1–17)
- ✅ `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` — fully implemented (lines 1–33), returns `null` at minimum breakpoint, short format at standard, verbose at large
- ✅ `apps/tui/src/screens/Agents/components/index.ts` — barrel export: `export * from "./MessageBlock"; export * from "./ToolBlock";`
- ❌ `apps/tui/src/screens/Agents/components/MessageBlock.tsx` — empty stub (`export {};`)
- ❌ `apps/tui/src/screens/Agents/components/ToolBlock.tsx` — empty stub (`export {};`)
- ❌ `apps/tui/src/theme/syntaxStyle.ts` — does not yet exist (directory `apps/tui/src/theme/` does not exist)
- ❌ `apps/tui/src/screens/Agents/utils/generateSummary.ts` — does not yet exist
- ✅ `apps/tui/src/lib/diff-syntax.ts` — production-ready (lines 1–161): `detectColorTier()`, `getPaletteForTier()`, `createDiffSyntaxStyle()`, `ColorTier` type, all three palette tiers
- ✅ `apps/tui/src/hooks/useDiffSyntaxStyle.ts` — production-ready (lines 1–52): per-component `SyntaxStyle` lifecycle hook with `destroy()` cleanup on unmount
- ✅ `e2e/tui/diff.test.ts` — exists at repo root as reference for test patterns (47 test stubs using `@microsoft/tui-test`'s `createTestTui`)
- ✅ `specs/tui/e2e/tui/agents.test.ts` — 518 test stubs covering session list, chat screen, and replay; serves as scaffolding reference, NOT the implementation target
- ❌ `e2e/tui/agents.test.ts` — does not yet exist at the canonical test location
- ❌ `useTheme()` / `ThemeProvider` — not yet implemented; components must use direct color constants as interim

The implementation work is Steps 1–7 of the plan below.

---

## 2. Data Types

All types are already implemented in `apps/tui/src/screens/Agents/types.ts` (lines 1–17). No changes needed. Reproduced here for reference:

```typescript
// apps/tui/src/screens/Agents/types.ts  (already exists — do NOT recreate)

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; input: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      output: string;
      isError: boolean;
    };

export interface AgentMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  timestamp: string; // ISO-8601
  /** True when this message is still being streamed (assistant only) */
  streaming?: boolean;
}

export type Breakpoint = "minimum" | "standard" | "large";
```

### Design decisions

- `MessagePart` is a discriminated union on `type`. The component iterates `message.parts` and renders each by type. The switch is exhaustive and TypeScript-checked.
- `tool_call` and `tool_result` share a `name` field so ToolBlock can display the tool name in both collapsed and expanded states, independent of whether it is a call or a result.
- `streaming` is a per-message boolean, only meaningful for `assistant` role. It controls the braille spinner and the `streaming` prop passed to `<markdown>`.
- `Breakpoint` is the same enum used throughout the TUI's responsive layout system (`useLayout().breakpoint`). MessageBlock and ToolBlock accept it as a prop — they do not call `useLayout()` themselves, keeping them maximally portable and testable.

---

## 3. Theme Integration

### 3.1 Color token strategy

Both components use semantic color tokens. The TUI's `ThemeProvider` and `useTheme()` hook are **not yet implemented** (see engineering-architecture.md §ThemeProvider). Until ThemeProvider lands, components define color constants in a shared module.

**Key finding from OpenTUI API:** The `fg` prop on `<text>`, `<span>`, `<b>`, `<em>`, etc. accepts `string | RGBA` (per `TextNodeOptions` in `@opentui/react` JSX namespace). The `<b>`, `<em>`, `<i>`, `<strong>`, `<u>` elements are declared as `SpanProps` elements in the React JSX namespace (see `context/opentui/packages/react/jsx-namespace.d.ts` lines 53–59) and extend `TextNodeRenderable`, automatically applying `TextAttributes.BOLD` or `TextAttributes.ITALIC` respectively via the `TextModifierRenderable` class.

For the interim color constants, we use `RGBA` objects from `@opentui/core` for type safety and consistency with the existing `diff-syntax.ts` pattern (which allocates module-level `RGBA` constants at lines 5–20).

When ThemeProvider is implemented, the migration is mechanical: replace `COLORS.primary` with `theme.primary` from `useTheme()`.

```typescript
// apps/tui/src/screens/Agents/components/colors.ts
// Interim color constants — will be replaced by useTheme() when ThemeProvider lands
// TODO(ThemeProvider): Replace COLORS with useTheme()
import { RGBA } from "@opentui/core";
import { detectColorTier, type ColorTier } from "../../../lib/diff-syntax.js";

function resolveColors(tier: ColorTier) {
  switch (tier) {
    case "truecolor":
      return {
        primary:  RGBA.fromHex("#2563EB"),  // Blue — user role label
        success:  RGBA.fromHex("#16A34A"),  // Green — assistant role label, success indicator
        warning:  RGBA.fromHex("#CA8A04"),  // Yellow — tool name, expand indicator
        error:    RGBA.fromHex("#DC2626"),  // Red — error results, error indicator
        muted:    RGBA.fromHex("#A3A3A3"),  // Gray — system label, timestamps, separators
        border:   RGBA.fromHex("#525252"),  // Dark gray — separator lines
      } as const;
    case "ansi256":
      return {
        primary:  RGBA.fromInts(0, 95, 255, 255),     // ANSI 33
        success:  RGBA.fromInts(0, 175, 0, 255),      // ANSI 34
        warning:  RGBA.fromInts(215, 175, 0, 255),    // ANSI 178
        error:    RGBA.fromInts(255, 0, 0, 255),      // ANSI 196
        muted:    RGBA.fromInts(168, 168, 168, 255),  // ANSI 245
        border:   RGBA.fromInts(88, 88, 88, 255),     // ANSI 240
      } as const;
    case "ansi16":
      return {
        primary:  RGBA.fromInts(0, 0, 255, 255),      // Blue
        success:  RGBA.fromInts(0, 255, 0, 255),      // Green
        warning:  RGBA.fromInts(255, 255, 0, 255),    // Yellow
        error:    RGBA.fromInts(255, 0, 0, 255),      // Red
        muted:    RGBA.fromInts(192, 192, 192, 255),  // White (dim)
        border:   RGBA.fromInts(192, 192, 192, 255),  // White (dim)
      } as const;
  }
}

// Resolved once at module load — same tier detection as diff-syntax.ts
const COLOR_TIER = detectColorTier();
export const COLORS = resolveColors(COLOR_TIER);
export { COLOR_TIER };
```

**Location:** `apps/tui/src/screens/Agents/components/colors.ts` — imported by both MessageBlock and ToolBlock.

### 3.2 Semantic color mapping

| Token | ANSI 256 | Used for |
|-------|----------|----------|
| `primary` | 33 (Blue) | User role label, user message links |
| `success` | 34 (Green) | Assistant role label, spinner, tool result success indicator |
| `warning` | 178 (Yellow) | ToolBlock tool name, expand/collapse indicator |
| `error` | 196 (Red) | Tool result error styling, error label, error indicator |
| `muted` | 245 (Gray) | System role label, timestamps, section labels ("Input:", "Result:", "Error:") |
| `border` | 240 (Gray) | Visual separator line between messages |

### 3.3 SyntaxStyle singleton

Both `<markdown>` and `<code>` OpenTUI components require a `SyntaxStyle` instance. Per the OpenTUI API:
- `MarkdownOptions.syntaxStyle: SyntaxStyle` is required (see `context/opentui/packages/core/src/renderables/Markdown.ts` line 66)
- `CodeOptions.syntaxStyle: SyntaxStyle` is required (see `context/opentui/packages/core/src/renderables/Code.ts` line 34)

This follows the established pattern in `apps/tui/src/hooks/useDiffSyntaxStyle.ts` (lines 21–52) and `apps/tui/src/lib/diff-syntax.ts` (lines 154–157).

For agent message rendering, a **module-level singleton** is appropriate (contrast with `useDiffSyntaxStyle` which creates per-component instances with `destroy()` on unmount). Rationale:
1. MessageBlock components are created/destroyed frequently during scrolling with `viewportCulling={true}` — per-instance `SyntaxStyle.fromStyles()` involves native Zig FFI calls for each `registerStyle` invocation, making create/destroy expensive
2. The style is identical across all agent message components
3. Lifetime matches the TUI process lifetime — no leak concern

**New file required:** `apps/tui/src/theme/syntaxStyle.ts`

```typescript
// apps/tui/src/theme/syntaxStyle.ts
import { SyntaxStyle } from "@opentui/core";
import { getPaletteForTier, detectColorTier } from "../lib/diff-syntax.js";

const tier = detectColorTier();
const palette = getPaletteForTier(tier);

/**
 * Singleton SyntaxStyle for markdown and code rendering outside the diff viewer.
 * Created via SyntaxStyle.fromStyles() with the detected color tier palette.
 *
 * Unlike useDiffSyntaxStyle (which creates per-component instances that are
 * destroyed on unmount — see apps/tui/src/hooks/useDiffSyntaxStyle.ts:42-49),
 * this is a module-level singleton because:
 * 1. MessageBlock instances are created/destroyed frequently during scrolling
 *    with viewport culling — per-instance create/destroy would be expensive.
 * 2. The style is identical across all agent message components.
 * 3. Lifetime matches the TUI process lifetime.
 *
 * Note: SyntaxStyle.fromStyles() allocates native (Zig) resources. This
 * singleton is never destroyed — it lives for the process lifetime. This is
 * intentional and acceptable for a TUI application.
 */
export const defaultSyntaxStyle: SyntaxStyle = SyntaxStyle.fromStyles(palette);
```

This singleton is imported wherever `<markdown syntaxStyle={...}>` or `<code syntaxStyle={...}>` is used. It reuses the existing `diff-syntax.ts` palette infrastructure (`getPaletteForTier()` at line 123 returns `Record<string, StyleDefinition>` with tokens like `keyword`, `string`, `comment`, etc.) rather than duplicating color definitions.

---

## 4. MessageBlock Component

**File:** `apps/tui/src/screens/Agents/components/MessageBlock.tsx`

### 4.1 Props interface

```typescript
export interface MessageBlockProps {
  message: AgentMessage;
  breakpoint: Breakpoint;
  showSeparator?: boolean;         // defaults to true
  expandedToolIds?: Set<string>;   // controlled by parent
  onToggleToolExpand?: (toolId: string) => void;
}
```

**State management note:** `expandedToolIds` is a `Set<string>` owned and managed by the **parent screen**. `MessageBlock` is stateless with respect to expansion; it passes through the `expanded` boolean and `onToggle` callback to each `ToolBlock`. This design allows the parent's `X` keybinding to expand/collapse all tool blocks across all messages at once.

### 4.2 Internal `useSpinner` hook

```typescript
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const SPINNER_INTERVAL_MS = 100;

function useSpinner(active: boolean): string {
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % BRAILLE_FRAMES.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);
  return active ? BRAILLE_FRAMES[frameIndex] : "";
}
```

Interval registered only when `active === true`. Cleans up when `message.streaming` flips to `false`. The 100ms interval (10fps animation) is well within terminal rendering budgets and produces a smooth spinner effect.

**React 19 strict mode safety:** In strict mode, React double-invokes effects. The cleanup function (`clearInterval(id)`) ensures no leaked intervals on the first unmount. The second mount creates a fresh interval. The `setFrameIndex` updater function form is used to avoid stale closure issues.

### 4.3 Label and padding configuration by breakpoint

```typescript
const LABEL_CONFIG: Record<MessageRole, Record<Breakpoint, { label: string }>> = {
  user:      { minimum: { label: "Y:" }, standard: { label: "You"   }, large: { label: "You"   } },
  assistant: { minimum: { label: "A:" }, standard: { label: "Agent" }, large: { label: "Agent" } },
  system:    { minimum: { label: "System" }, standard: { label: "System" }, large: { label: "System" } },
  tool:      { minimum: { label: ""  }, standard: { label: ""      }, large: { label: ""      } },
};

const PADDING_CONFIG: Record<Breakpoint, { left: number; right: number }> = {
  minimum:  { left: 0, right: 0 },
  standard: { left: 2, right: 2 },
  large:    { left: 4, right: 4 },
};
```

### 4.4 Rendering logic by role

**user:** Left-aligned. `"You"`/`"Y:"` label in `COLORS.primary` bold via `<text fg={COLORS.primary}><b>{label}</b></text>`. Relative timestamp in `COLORS.muted` (hidden at minimum breakpoint — `formatTimestamp()` returns `null` at line 8). Body via `<markdown>` per text part.

**assistant:** Left-aligned. Optional spinner char before label (spinner in `COLORS.success`, same line as label). `"Agent"`/`"A:"` in `COLORS.success` bold. Same timestamp logic. Body via `<markdown>` with `streaming={true}` on the **last text part only** when `message.streaming` is true. Per the OpenTUI API (see `context/opentui/packages/core/src/renderables/Markdown.ts` lines 75–87), `streaming={true}` keeps the trailing markdown block unstable while chunks are being appended; set to `false` once streaming completes to finalize parsing. ToolBlock instances interspersed in part order.

**system:** Centered (`alignItems: "center"` on the outer `<box>`). `"System"` in `COLORS.muted`. Body via `<text fg={COLORS.muted}>` with `<em>` wrapper for italic. No timestamp at any breakpoint.

**tool:** Delegates entirely to part iteration (ToolBlock renders all content). No header row rendered. This role is used when the message consists only of `tool_call` and/or `tool_result` parts.

### 4.5 Part iteration

Parts rendered in source-array order via a switch on `part.type`. The `streaming` prop is passed only to the **last text part** in the array to avoid intermediate markdown sections being treated as incomplete:

```typescript
const lastTextIndex = message.parts.reduceRight(
  (acc, p, i) => (acc === -1 && p.type === "text" ? i : acc), -1
);

{message.parts.map((part, index) => {
  switch (part.type) {
    case "text":
      return (
        <markdown
          key={`text-${index}`}
          content={part.content}
          syntaxStyle={defaultSyntaxStyle}
          streaming={
            message.role === "assistant" &&
            !!message.streaming &&
            index === lastTextIndex
          }
        />
      );
    case "tool_call":
      return (
        <ToolBlock
          key={`tool-call-${part.id}`}
          variant="call"
          toolName={part.name}
          input={part.input}
          expanded={expandedToolIds?.has(part.id) ?? false}
          onToggle={() => onToggleToolExpand?.(part.id)}
          breakpoint={breakpoint}
        />
      );
    case "tool_result":
      return (
        <ToolBlock
          key={`tool-result-${part.id}`}
          variant="result"
          toolName={part.name}
          output={part.output}
          isError={part.isError}
          expanded={expandedToolIds?.has(part.id) ?? false}
          onToggle={() => onToggleToolExpand?.(part.id)}
          breakpoint={breakpoint}
        />
      );
    default: {
      const _exhaustive: never = part;
      return (
        <text key={`unknown-${index}`} fg={COLORS.muted}>
          [unknown part type]
        </text>
      );
    }
  }
})}
```

**Note on exhaustive default:** The `const _exhaustive: never = part` line produces a TypeScript error at compile time if a new `MessagePart` variant is added without updating this switch. At runtime, the `default` branch renders a visible fallback so the UI does not crash.

### 4.6 Visual separator

A horizontal line of `─` characters spanning content width (terminal width minus left and right padding), rendered in `COLORS.border` color:

```typescript
const { width } = useTerminalDimensions(); // from @opentui/react
const padding = PADDING_CONFIG[breakpoint];
const separatorWidth = Math.max(0, width - padding.left - padding.right);

{showSeparator !== false && (
  <box height={1} width="100%">
    <text fg={COLORS.border}>{"─".repeat(separatorWidth)}</text>
  </box>
)}
```

The separator is rendered **below** the message content. The last message in a list should pass `showSeparator={false}` to avoid a trailing line.

### 4.7 Overall component structure

```typescript
import React, { useState, useEffect } from "react";
import { useTerminalDimensions } from "@opentui/react";
import type { AgentMessage, Breakpoint, MessageRole, MessagePart } from "../types.js";
import { formatTimestamp } from "../utils/formatTimestamp.js";
import { defaultSyntaxStyle } from "../../../theme/syntaxStyle.js";
import { ToolBlock } from "./ToolBlock.js";
import { COLORS, COLOR_TIER } from "./colors.js";

function MessageBlockInner({
  message,
  breakpoint,
  showSeparator = true,
  expandedToolIds,
  onToggleToolExpand,
}: MessageBlockProps) {
  const { width } = useTerminalDimensions();
  const padding = PADDING_CONFIG[breakpoint];
  const spinner = useSpinner(
    message.role === "assistant" && !!message.streaming
  );

  const labelConfig = LABEL_CONFIG[message.role][breakpoint];
  const timestamp = formatTimestamp(message.timestamp, breakpoint);

  const alignment =
    message.role === "system" ? "center" : "flex-start";

  return (
    <box
      flexDirection="column"
      width="100%"
      paddingLeft={padding.left}
      paddingRight={padding.right}
      alignItems={alignment}
    >
      {/* Header row: label + timestamp (not shown for tool role) */}
      {message.role !== "tool" && labelConfig.label && (
        <box flexDirection="row" gap={1} width="100%">
          {renderRoleLabel(message.role, labelConfig.label, spinner)}
          {timestamp && (
            <text fg={COLORS.muted}>{timestamp}</text>
          )}
        </box>
      )}

      {/* Message parts */}
      {renderParts(message, breakpoint, expandedToolIds, onToggleToolExpand)}

      {/* Separator */}
      {showSeparator && (
        <box height={1} width="100%">
          <text fg={COLORS.border}>
            {"─".repeat(Math.max(0, width - padding.left - padding.right))}
          </text>
        </box>
      )}
    </box>
  );
}
```

### 4.8 Role label rendering helper

```typescript
function renderRoleLabel(
  role: MessageRole,
  label: string,
  spinner: string
): React.ReactNode {
  switch (role) {
    case "user":
      return <text fg={COLORS.primary}><b>{label}</b></text>;
    case "assistant":
      return (
        <text fg={COLORS.success}>
          {spinner && <>{spinner} </>}
          <b>{label}</b>
        </text>
      );
    case "system":
      return <text fg={COLORS.muted}><em>{label}</em></text>;
    case "tool":
      return null;
  }
}
```

**Note on OpenTUI JSX nesting:** `<b>`, `<em>`, `<strong>`, `<i>` are valid children of `<text>`. They are declared as `SpanProps` elements in the `@opentui/react` JSX namespace and extend `TextNodeRenderable`, automatically applying `TextAttributes.BOLD` and `TextAttributes.ITALIC` respectively.

### 4.9 `React.memo` wrapping

The exported component is wrapped with `React.memo()`. Parent screens must provide stable message object references and stable `expandedToolIds` Set references (use immutable Set update patterns).

```typescript
export const MessageBlock = React.memo(MessageBlockInner);
export type { MessageBlockProps };
```

---

## 5. ToolBlock Component

**File:** `apps/tui/src/screens/Agents/components/ToolBlock.tsx`

### 5.1 Props interface

```typescript
interface ToolBlockBaseProps {
  toolName: string;
  expanded: boolean;
  onToggle: () => void;
  breakpoint: Breakpoint;
}
interface ToolBlockCallProps extends ToolBlockBaseProps {
  variant: "call";
  input: string;
  output?: never;
  isError?: never;
}
interface ToolBlockResultProps extends ToolBlockBaseProps {
  variant: "result";
  output: string;
  isError: boolean;
  input?: never;
}
export type ToolBlockProps = ToolBlockCallProps | ToolBlockResultProps;
```

The `never` guards enforce that `input` is only provided with `variant: "call"` and `output`/`isError` only with `variant: "result"`. TypeScript will error at the call site if these constraints are violated.

### 5.2 Content truncation utility

```typescript
const MAX_CONTENT_BYTES = 64 * 1024; // 64KB
const TRUNCATION_NOTICE = "\n… (truncated — content exceeds 64KB)";

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_BYTES) return content;
  return content.slice(0, MAX_CONTENT_BYTES) + TRUNCATION_NOTICE;
}
```

File-local utility. Byte-approximated length check (JavaScript string length ≈ byte count for ASCII/UTF-8). Applied before passing to `<code>` or `<markdown>` to prevent rendering extremely large tool outputs.

### 5.3 Tool name truncation

```typescript
const MAX_TOOL_NAME_LENGTH = 50;

function truncateToolName(name: string): string {
  if (name.length <= MAX_TOOL_NAME_LENGTH) return name;
  return name.slice(0, MAX_TOOL_NAME_LENGTH - 1) + "…";
}
```

### 5.4 Collapsed rendering

Single row layout (left-to-right via `flexDirection="row"`):

1. **Result status prefix** (result variant only): `✓` in `COLORS.success` or `✗` in `COLORS.error`, followed by a space
2. **Expand indicator**: `▶` in `COLORS.warning`
3. **Space separator**
4. **Tool name**: bold, `COLORS.warning`, truncated to 50ch + `…`
5. **Summary** (standard/large only): ` — ` separator + truncated summary in `COLORS.muted`

```tsx
<box flexDirection="row">
  {props.variant === "result" && (
    <text fg={props.isError ? COLORS.error : COLORS.success}>
      {props.isError ? indicators.error : indicators.success}{" "}
    </text>
  )}
  <text fg={COLORS.warning}>{indicators.collapsed} </text>
  <text fg={COLORS.warning}><b>{truncateToolName(props.toolName)}</b></text>
  {summary && (
    <text fg={COLORS.muted}> — {summary}</text>
  )}
</box>
```

### 5.5 Expanded rendering

Header row (same as collapsed but with `▼` indicator and no summary) followed by indented content:

```tsx
<box flexDirection="column">
  {/* Header row */}
  <box flexDirection="row">
    {props.variant === "result" && (
      <text fg={props.isError ? COLORS.error : COLORS.success}>
        {props.isError ? indicators.error : indicators.success}{" "}
      </text>
    )}
    <text fg={COLORS.warning}>{indicators.expanded} </text>
    <text fg={COLORS.warning}><b>{truncateToolName(props.toolName)}</b></text>
  </box>

  {/* Content */}
  <box paddingLeft={2}>
    {props.variant === "call" ? (
      <box flexDirection="column">
        <text fg={COLORS.muted}>Input:</text>
        <code
          content={truncateContent(props.input)}
          filetype="json"
          syntaxStyle={defaultSyntaxStyle}
        />
      </box>
    ) : props.isError ? (
      <box flexDirection="column">
        <text fg={COLORS.error}>Error:</text>
        <text fg={COLORS.error}>{truncateContent(props.output)}</text>
      </box>
    ) : (
      <box flexDirection="column">
        <text fg={COLORS.muted}>Result:</text>
        <markdown
          content={truncateContent(props.output)}
          syntaxStyle={defaultSyntaxStyle}
        />
      </box>
    )}
  </box>
</box>
```

**OpenTUI API notes:**
- `<code>` requires `content: string`, `syntaxStyle: SyntaxStyle`, and accepts optional `filetype: string` (see `CodeOptions` in `context/opentui/packages/core/src/renderables/Code.ts`). For ToolBlock, `filetype="json"` is always used because tool inputs are JSON.
- `<markdown>` requires `content: string` and `syntaxStyle: SyntaxStyle`, accepts optional `streaming?: boolean` (see `MarkdownOptions` in `context/opentui/packages/core/src/renderables/Markdown.ts`). ToolBlock result markdown is never streaming — streaming is handled at the MessageBlock level for assistant text parts only.

### 5.6 `generateSummary` utility

**File:** `apps/tui/src/screens/Agents/utils/generateSummary.ts`

```typescript
import type { Breakpoint } from "../types.js";

export const SUMMARY_LIMIT: Record<Breakpoint, number | null> = {
  minimum: null,   // hidden at minimum breakpoint
  standard: 60,    // 60-char truncated summary
  large: 120,      // 120-char summary for wide terminals
};

/**
 * Generate a one-line summary of tool input/output content.
 * Returns null if summaries are hidden at the given breakpoint.
 * Replaces newlines with spaces and truncates with ellipsis.
 */
export function generateSummary(
  content: string,
  breakpoint: Breakpoint
): string | null {
  const limit = SUMMARY_LIMIT[breakpoint];
  if (limit === null) return null;
  const oneLine = content.replace(/\r?\n/g, " ").trim();
  if (oneLine.length === 0) return null;
  if (oneLine.length <= limit) return oneLine;
  return oneLine.slice(0, limit - 1) + "…";
}
```

Exported as a separate module (not inlined in ToolBlock) for independent testability. `SUMMARY_LIMIT` is also exported for use in test assertions.

### 5.7 Summary content source

ToolBlock computes the summary from the content relevant to its variant:

```typescript
const summaryContent = props.variant === "call" ? props.input : props.output;
const summary = generateSummary(summaryContent, props.breakpoint);
```

### 5.8 Keyboard interaction

ToolBlock does **NOT** register keybindings itself. It does not use `useKeyboard`. The toggle interaction is managed entirely by the parent screen:

- The parent screen tracks which ToolBlock has focus
- `x` key: calls `onToggleToolExpand(focusedToolId)` when a ToolBlock is focused
- `Enter` on focused ToolBlock: same as `x` for that specific block
- `X` (Shift+x): iterates all tool IDs and toggles all to the opposite of the majority state

ToolBlock is a pure render component — it renders collapsed or expanded based on its `expanded` prop and calls `onToggle()` when its parent delegates a toggle action.

### 5.9 Unicode and ASCII indicator sets

When the detected color tier is `"ansi16"` (bare linux console, old xterm, dumb terminals — see `detectColorTier()` at `apps/tui/src/lib/diff-syntax.ts` lines 103–121), Unicode indicators are replaced with ASCII equivalents:

```typescript
interface Indicators {
  collapsed: string;
  expanded: string;
  success: string;
  error: string;
}

const UNICODE_INDICATORS: Indicators = {
  collapsed: "▶",
  expanded: "▼",
  success: "✓",
  error: "✗",
};

const ASCII_INDICATORS: Indicators = {
  collapsed: ">",
  expanded: "v",
  success: "+",
  error: "x",
};

// Selected at module load based on detected color tier
const indicators = COLOR_TIER === "ansi16" ? ASCII_INDICATORS : UNICODE_INDICATORS;
```

### 5.10 Content size limits

| Content | Limit | Behavior |
|---------|-------|----------|
| Tool input / output | 64KB | Truncated with `"… (truncated — content exceeds 64KB)"` |
| Tool name | 50 chars | Truncated with `…` |
| Summary (standard) | 60 chars | Truncated with `…` |
| Summary (large) | 120 chars | Truncated with `…` |
| Summary (minimum) | hidden | `null` returned by `generateSummary()` |

### 5.11 `React.memo` wrapping

```typescript
export const ToolBlock = React.memo(ToolBlockInner);
export type { ToolBlockProps };
```

---

## 6. File Structure

```
apps/tui/src/
├── theme/
│   └── syntaxStyle.ts                    ← NEW (create directory + file)
└── screens/
    └── Agents/
        ├── types.ts                      ← EXISTING (no changes)
        ├── utils/
        │   ├── formatTimestamp.ts         ← EXISTING (no changes)
        │   └── generateSummary.ts         ← NEW
        └── components/
            ├── colors.ts                 ← NEW (shared color constants)
            ├── MessageBlock.tsx           ← IMPLEMENT (replace empty stub)
            ├── ToolBlock.tsx             ← IMPLEMENT (replace empty stub)
            └── index.ts                  ← UPDATE (add export for colors)

e2e/tui/
├── diff.test.ts                          ← EXISTING (reference for test patterns)
└── agents.test.ts                        ← NEW (canonical test location)
```

---

## Implementation Plan

### Step 1: Create `apps/tui/src/theme/` directory and SyntaxStyle singleton (30 min)

**File:** `apps/tui/src/theme/syntaxStyle.ts`

1. Create `apps/tui/src/theme/` directory
2. Import `SyntaxStyle` from `@opentui/core` and palette utilities from `../lib/diff-syntax.js`
3. Detect color tier via `detectColorTier()` (same function used at `apps/tui/src/lib/diff-syntax.ts:103`)
4. Get palette via `getPaletteForTier(tier)` (same function at `apps/tui/src/lib/diff-syntax.ts:123`)
5. Create singleton: `export const defaultSyntaxStyle = SyntaxStyle.fromStyles(palette)` — this calls `SyntaxStyle.fromStyles()` which internally calls `registerStyle()` for each palette entry
6. Verify TypeScript compilation with `bun run check` in `apps/tui/`

**Acceptance criteria:**
- File compiles without errors
- `defaultSyntaxStyle` is a valid `SyntaxStyle` instance
- Reuses existing palette from `diff-syntax.ts` (no color duplication)
- No `destroy()` call — intentionally lives for process lifetime (justified in §3.3)

### Step 2: Create shared color constants module (20 min)

**File:** `apps/tui/src/screens/Agents/components/colors.ts`

1. Import `RGBA` from `@opentui/core` and `detectColorTier`, `ColorTier` from `../../../lib/diff-syntax.js`
2. Implement `resolveColors(tier: ColorTier)` function per §3.1
3. Export `COLORS` constant (resolved once at module load via `detectColorTier()` — same env var detection as `diff-syntax.ts:103-121`)
4. Export `COLOR_TIER` for indicator selection in ToolBlock
5. Add `// TODO(ThemeProvider): Replace COLORS with useTheme()` comment

**Acceptance criteria:**
- All six semantic tokens (`primary`, `success`, `warning`, `error`, `muted`, `border`) defined for all three tiers
- `COLORS` is a frozen constant (resolved once, not per-render)
- TypeScript compiles without errors

### Step 3: Implement `generateSummary` utility (30 min)

**File:** `apps/tui/src/screens/Agents/utils/generateSummary.ts`

1. Implement `generateSummary(content, breakpoint)` per §5.6
2. Export `SUMMARY_LIMIT` constant for test use
3. Handle edge cases: empty string returns `null`, whitespace-only returns `null`
4. Verify TypeScript compilation

**Acceptance criteria:**
- Returns `null` for minimum breakpoint
- Returns full content if under limit
- Truncates with `…` if over limit
- Replaces newlines with spaces
- Empty/whitespace content returns `null`

### Step 4: Build `ToolBlock` component (2 hours)

**File:** `apps/tui/src/screens/Agents/components/ToolBlock.tsx`

1. Define `ToolBlockProps` discriminated union with `never` type guards (§5.1)
2. Implement `truncateContent()` (64KB limit, file-local function — §5.2)
3. Implement `truncateToolName()` (50 char limit, file-local function — §5.3)
4. Define `UNICODE_INDICATORS` and `ASCII_INDICATORS` objects, select based on `COLOR_TIER` (§5.9)
5. Import `COLORS` and `COLOR_TIER` from `./colors.js`
6. Import `defaultSyntaxStyle` from `../../../theme/syntaxStyle.js`
7. Import `generateSummary` from `../utils/generateSummary.js`
8. Implement collapsed state rendering: indicator → tool name → optional summary (§5.4)
9. Implement expanded state rendering: header → indented content, branching on call/result/error (§5.5)
10. Wrap in `React.memo()` (§5.11)
11. Export component and props type
12. Verify TypeScript compiles — check exhaustiveness of variant discrimination

**Acceptance criteria:**
- Collapsed call variant shows: `▶ toolName — summary`
- Collapsed result success shows: `✓ ▶ toolName — summary`
- Collapsed result error shows: `✗ ▶ toolName — summary` (with error colors)
- Expanded call shows: `▼ toolName` + `Input:` label in muted + `<code filetype="json">` block
- Expanded result success shows: `▼ toolName` + `Result:` label in muted + `<markdown>` block
- Expanded result error shows: `▼ toolName` + `Error:` label in red + red text output
- Content >64KB truncated with notice
- Tool name >50ch truncated with `…`
- Summary hidden at minimum breakpoint
- At `ansi16` tier: ASCII indicators (`>`, `v`, `+`, `x`) used instead of Unicode

### Step 5: Build `MessageBlock` component (3 hours)

**File:** `apps/tui/src/screens/Agents/components/MessageBlock.tsx`

1. Implement `useSpinner(active)` hook with braille frames and 100ms interval (§4.2)
2. Define `LABEL_CONFIG` and `PADDING_CONFIG` constants (§4.3)
3. Implement `renderRoleLabel()` helper function (§4.8)
4. Implement part iteration logic with `lastTextIndex` computation for streaming (§4.5)
5. Handle all four roles: user, assistant, system, tool (§4.4)
6. Add exhaustive default branch in part switch with `never` check
7. Implement separator line using `useTerminalDimensions().width` from `@opentui/react` (§4.6)
8. Import and wire `formatTimestamp` from `../utils/formatTimestamp.js` (existing at `apps/tui/src/screens/Agents/utils/formatTimestamp.ts`)
9. Import and wire `ToolBlock` for tool_call/tool_result parts
10. Pass `expandedToolIds` and `onToggleToolExpand` through to ToolBlock instances
11. Wrap in `React.memo()` (§4.9)
12. Export component and props type
13. Verify TypeScript compiles

**Acceptance criteria:**
- User messages show "You"/"Y:" in primary color with bold
- Assistant messages show "Agent"/"A:" in success color with bold
- Streaming assistant shows braille spinner before label
- System messages centered, muted, italic
- Tool role renders only parts (no header)
- Timestamps hidden at minimum (per `formatTimestamp` line 8), short at standard, verbose at large
- Padding: 0ch minimum, 2ch standard, 4ch large
- Separator line rendered in border color, width = terminal width - left padding - right padding
- ToolBlock parts rendered inline with text parts in source order
- `expandedToolIds` set membership controls ToolBlock expanded/collapsed state
- `streaming={true}` passed to `<markdown>` only on the last text part of a streaming assistant message

### Step 6: Update barrel export and verify compilation (15 min)

**Files:**
- `apps/tui/src/screens/Agents/components/index.ts` — already has `export * from "./MessageBlock"` and `export * from "./ToolBlock"`
- Add `export * from "./colors"` to expose `COLORS` and `COLOR_TIER`

1. Verify that TypeScript compilation succeeds now that both files export real types
2. Verify that `MessageBlock`, `MessageBlockProps`, `ToolBlock`, `ToolBlockProps`, `COLORS`, `COLOR_TIER` are all accessible from the barrel
3. Full `bun run check` pass in `apps/tui/`

### Step 7: Write E2E tests (2 hours)

**File:** `e2e/tui/agents.test.ts`

1. Import `createTestTui` from `@microsoft/tui-test` (following pattern from `e2e/tui/diff.test.ts:1`)
2. Write 38 tests across 4 categories as specified in §8
3. Follow the pattern established in `e2e/tui/diff.test.ts` — test stubs with comment-based assertion outlines describing setup, actions, and expected state
4. Tests that require backend API (agent session data) are left failing — never skipped (per `specs/tui/prd.md` §7.3 and `MEMORY.md` feedback)
5. Tests run against real API server with test fixtures, not mocks (per engineering-architecture.md §Testing Philosophy)

**Note on existing test scaffolding:** `specs/tui/e2e/tui/agents.test.ts` contains 518 test stubs covering session list, chat, and replay features. The tests in this ticket's `e2e/tui/agents.test.ts` are scoped specifically to MessageBlock and ToolBlock rendering behavior. When the session list and chat screen tickets are implemented, those 518 tests should be merged into the canonical `e2e/tui/agents.test.ts` file.

---

## Unit & Integration Tests

**File:** `e2e/tui/agents.test.ts`
**Framework:** `@microsoft/tui-test` + `bun:test`

All tests within `describe("TUI_AGENT_MESSAGE_BLOCK")`. Tests follow the pattern from `e2e/tui/diff.test.ts`: `import { createTestTui } from "@microsoft/tui-test"`, comment-based assertion outlines. Tests that fail due to unimplemented backend are left failing — never skipped or commented out.

### 8.1 Terminal Snapshot Tests (14)

```typescript
import { createTestTui } from "@microsoft/tui-test"

describe("TUI_AGENT_MESSAGE_BLOCK — terminal snapshots", () => {
  test("SNAP-MSG-001: user message at 120×40 — You label in primary color, timestamp visible", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with user message (g a → select session)
    // Capture terminal snapshot
    // Assert: "You" label rendered in blue (ANSI 33)
    // Assert: relative timestamp visible (e.g., "3m" or "<1m")
    // Assert: message body rendered as markdown
    // Assert matches golden file
  })

  test("SNAP-MSG-002: user message at 80×24 — Y: label, no timestamp, 0 padding", async () => {
    // Launch TUI at 80x24 (minimum breakpoint)
    // Navigate to agent session with user message
    // Capture terminal snapshot
    // Assert: "Y:" abbreviated label (not "You")
    // Assert: no timestamp text present on header line
    // Assert: content starts at column 0 (no left padding)
    // Assert matches golden file
  })

  test("SNAP-MSG-003: assistant message at 120×40 — Agent label in success color", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with assistant message
    // Assert: "Agent" label rendered in green (ANSI 34)
    // Assert: message body rendered via markdown
    // Assert: no spinner (streaming: false)
  })

  test("SNAP-MSG-004: assistant message at 80×24 — A: label", async () => {
    // Launch TUI at 80x24
    // Navigate to agent session with assistant message
    // Assert: "A:" abbreviated label
    // Assert: no timestamp
  })

  test("SNAP-MSG-005: streaming assistant at 120×40 — braille spinner precedes Agent label", async () => {
    // Launch TUI at 120x40
    // Navigate to active agent session with streaming response
    // Wait for spinner frame to render
    // Assert: one of ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ appears before "Agent" label
    // Assert: spinner character is in green (ANSI 34)
  })

  test("SNAP-MSG-006: system message at 120×40 — centered, muted, italic label", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with system message
    // Assert: "System" label rendered in gray (ANSI 245)
    // Assert: text is centered (not left-aligned)
    // Assert: italic text attribute applied
  })

  test("SNAP-MSG-007: tool_call part collapsed at 120×40 — ▶ toolName — summary format", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with tool_call message
    // Assert: ▶ indicator in yellow (ANSI 178)
    // Assert: tool name in bold yellow
    // Assert: " — " separator followed by truncated summary
    // Assert: summary truncated to 60 chars with …
  })

  test("SNAP-MSG-008: tool_call at 80×24 — no summary, tool name only", async () => {
    // Launch TUI at 80x24
    // Navigate to agent session with tool_call message
    // Assert: ▶ indicator + tool name visible
    // Assert: no " — " separator (summary hidden at minimum)
  })

  test("SNAP-MSG-009: tool_result success at 120×40 — ✓ ▶ toolName — output summary", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with successful tool_result
    // Assert: ✓ in green before ▶
    // Assert: tool name in bold yellow
    // Assert: summary of output shown
  })

  test("SNAP-MSG-010: tool_result error at 120×40 — ✗ ▶ toolName in error color", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with error tool_result
    // Assert: ✗ in red (ANSI 196)
    // Assert: tool name still in yellow
  })

  test("SNAP-MSG-011: ToolBlock expanded call variant at 120×40 — Input label + JSON code block", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with tool_call
    // Expand the tool block (focus + x)
    // Assert: ▼ expanded indicator replaces ▶
    // Assert: "Input:" label in gray
    // Assert: JSON content rendered with syntax highlighting via <code filetype="json">
    // Assert: summary text is NOT shown (expanded mode)
  })

  test("SNAP-MSG-012: ToolBlock expanded result variant at 120×40 — Result label + markdown", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with successful tool_result
    // Expand the tool block
    // Assert: "Result:" label in gray
    // Assert: output rendered via <markdown> component
  })

  test("SNAP-MSG-013: visual separator between two messages at 120×40", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with multiple messages
    // Assert: horizontal line of ─ characters between messages
    // Assert: separator in gray (ANSI 240 border color)
    // Assert: separator spans terminal width minus padding (120 - 4 = 116 chars)
  })

  test("SNAP-MSG-014: large breakpoint at 200×60 — 4ch padding, extended timestamps", async () => {
    // Launch TUI at 200x60 (large breakpoint)
    // Navigate to agent session with messages
    // Assert: 4-character left padding on content
    // Assert: verbose timestamps ("3 minutes ago" not "3m")
    // Assert: tool summaries up to 120 chars
  })
})
```

### 8.2 Keyboard Interaction Tests (10)

```typescript
describe("TUI_AGENT_MESSAGE_BLOCK — keyboard interaction", () => {
  test("KEY-MSG-001: x key expands a collapsed ToolBlock", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session with tool_call
    // Focus the tool block header
    // Assert: ▶ collapsed indicator visible
    // Press x
    // Assert: ▼ expanded indicator replaces ▶
    // Assert: tool input content now visible
  })

  test("KEY-MSG-002: x key collapses an expanded ToolBlock", async () => {
    // From expanded state (after KEY-MSG-001)
    // Press x again
    // Assert: ▶ collapsed indicator restored
    // Assert: tool input content hidden
    // Assert: summary line restored
  })

  test("KEY-MSG-003: Enter on focused ToolBlock header toggles expand/collapse", async () => {
    // Launch TUI, navigate to agent session
    // Focus tool block header
    // Press Enter
    // Assert: tool block expands
    // Press Enter again
    // Assert: tool block collapses
  })

  test("KEY-MSG-004: X (Shift+x) expands all collapsed ToolBlocks in the session", async () => {
    // Navigate to session with 3+ tool blocks, all collapsed
    // Press X (Shift+x)
    // Assert: all tool blocks now show ▼ expanded indicator
    // Assert: all tool block contents visible
  })

  test("KEY-MSG-005: X (Shift+x) collapses all when all are currently expanded", async () => {
    // From all-expanded state (after KEY-MSG-004)
    // Press X
    // Assert: all tool blocks now show ▶ collapsed indicator
  })

  test("KEY-MSG-006: x is no-op when no ToolBlock has focus", async () => {
    // Navigate to agent session
    // Focus a text message (not a tool block)
    // Press x
    // Assert: no change in any tool block state
    // Assert: no error or crash
  })

  test("KEY-MSG-007: ToolBlock expand state preserved across scroll", async () => {
    // Navigate to session with many messages
    // Expand a tool block in the middle
    // Scroll down past it (j key multiple times)
    // Scroll back up to it (k key)
    // Assert: tool block is still expanded (▼ indicator)
  })

  test("KEY-MSG-008: ToolBlock expand state preserved across terminal resize", async () => {
    // Launch at 120x40
    // Expand a tool block
    // Resize terminal to 80x24
    // Assert: tool block still expanded
    // Assert: summary disappears (minimum breakpoint)
    // Resize back to 120x40
    // Assert: tool block still expanded, summary reappears
  })

  test("KEY-MSG-009: rapid x-x-x toggles are sequential, not batched", async () => {
    // Focus a tool block
    // Send x three times rapidly
    // Assert: final state is expanded (odd number of toggles)
    // Assert: no visual glitch or stuck state
  })

  test("KEY-MSG-010: expanded error result renders in error color after Enter toggle", async () => {
    // Navigate to session with error tool_result
    // Focus the tool block header
    // Press Enter to expand
    // Assert: "Error:" label in red (ANSI 196)
    // Assert: error output text in red
  })
})
```

### 8.3 Responsive Layout Tests (8)

```typescript
describe("TUI_AGENT_MESSAGE_BLOCK — responsive layout", () => {
  test("RESP-MSG-001: at 80×24 — role labels abbreviated to Y: / A:", async () => {
    // Launch TUI at 80x24
    // Navigate to agent session with user + assistant messages
    // Assert: first message shows "Y:" (not "You")
    // Assert: second message shows "A:" (not "Agent")
  })

  test("RESP-MSG-002: at 80×24 — timestamps hidden", async () => {
    // Launch TUI at 80x24
    // Navigate to agent session
    // Assert: no timestamp text on any message header line
    // Assert: no "m" or "h" or "d" time suffixes visible in header area
  })

  test("RESP-MSG-003: at 80×24 — padding is 0ch left and right", async () => {
    // Launch TUI at 80x24
    // Navigate to agent session
    // Assert: message content starts at column 0 (after header bar)
    // Assert: separator line spans full 80 characters
  })

  test("RESP-MSG-004: at 120×40 — full labels and relative timestamps visible", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session
    // Assert: "You" and "Agent" labels (not abbreviated)
    // Assert: timestamps like "<1m", "3m", "2h" visible
  })

  test("RESP-MSG-005: at 120×40 — tool summary shown (60ch), truncated with ellipsis", async () => {
    // Launch TUI at 120x40
    // Navigate to session with tool_call having >60 char input
    // Assert: summary text visible after " — "
    // Assert: summary ends with … if content exceeded 60 chars
  })

  test("RESP-MSG-006: at 200×60 — padding is 4ch left and right", async () => {
    // Launch TUI at 200x60
    // Navigate to agent session
    // Assert: message content starts at column 4
    // Assert: separator line is 192 characters wide (200 - 4 - 4)
  })

  test("RESP-MSG-007: resize from 120×40 to 80×24 — labels abbreviate on resize", async () => {
    // Launch TUI at 120x40
    // Navigate to agent session
    // Assert: "You" label visible
    // Resize to 80x24
    // Assert: "Y:" label replaces "You"
    // Assert: timestamps disappear
    // Assert: padding reduces to 0
  })

  test("RESP-MSG-008: resize from 80×24 to 200×60 — timestamps and 4ch padding appear", async () => {
    // Launch TUI at 80x24
    // Navigate to agent session
    // Resize to 200x60
    // Assert: verbose timestamps appear ("minutes ago" format)
    // Assert: 4ch padding applied
    // Assert: tool summaries up to 120 chars
  })
})
```

### 8.4 Edge Case Tests (6)

```typescript
describe("TUI_AGENT_MESSAGE_BLOCK — edge cases", () => {
  test("EDGE-MSG-001: message with empty text part renders role label only", async () => {
    // Navigate to session with message having { type: "text", content: "" }
    // Assert: role label visible ("You" or "Agent")
    // Assert: no crash
    // Assert: separator still renders
  })

  test("EDGE-MSG-002: tool input exceeding 64KB shows truncation indicator", async () => {
    // Navigate to session with tool_call having >64KB input
    // Expand the tool block
    // Assert: content visible (not empty)
    // Assert: "… (truncated — content exceeds 64KB)" text appears at end
  })

  test("EDGE-MSG-003: tool name at 50 chars not truncated; 51 chars truncated with …", async () => {
    // Navigate to session with tool_call named exactly 50 chars
    // Assert: full name visible, no ellipsis
    // Navigate to session with tool_call named 51 chars
    // Assert: name truncated to 50 chars with … at end (49 chars + …)
  })

  test("EDGE-MSG-004: mixed parts [text, tool_call, text, tool_result] render all four in order", async () => {
    // Navigate to session with assistant message having 4 parts:
    //   text → tool_call → text → tool_result
    // Assert: all four parts visible in source order
    // Assert: text parts rendered as markdown
    // Assert: tool parts rendered as ToolBlock components (collapsed by default)
  })

  test("EDGE-MSG-005: unicode and emoji in message content preserved", async () => {
    // Navigate to session with message containing: "Hello 🌍 — αβγ ✓"
    // Assert: emoji, em-dash, Greek letters, and checkmark all rendered
    // Assert: no mojibake or replacement characters
  })

  test("EDGE-MSG-006: unknown message part type does not crash; renders raw fallback", async () => {
    // Navigate to session where API returns a part with unknown type
    // Assert: TUI does not crash
    // Assert: fallback text "[unknown part type]" rendered in muted color
    // Assert: other parts in the same message still render normally
  })
})
```

### 8.5 Test count summary

| Category | Count |
|----------|-------|
| Terminal snapshot tests | 14 |
| Keyboard interaction tests | 10 |
| Responsive layout tests | 8 |
| Edge case tests | 6 |
| **Total** | **38** |

---

## 9. Productionization Checklist

### 9.1 SyntaxStyle singleton

Create `apps/tui/src/theme/syntaxStyle.ts` exporting `defaultSyntaxStyle = SyntaxStyle.fromStyles(palette)` using the existing `getPaletteForTier()` (at `apps/tui/src/lib/diff-syntax.ts:123`) and `detectColorTier()` (at `apps/tui/src/lib/diff-syntax.ts:103`).

**Why a module-level singleton (not a hook like `useDiffSyntaxStyle`):** MessageBlock components are created and destroyed frequently during scrolling with `viewportCulling={true}`. Per-instance SyntaxStyle creation/destruction (as `useDiffSyntaxStyle` does at lines 27–39 and 42–49) would be expensive — `SyntaxStyle.fromStyles()` allocates native Zig resources and involves multiple `registerStyle` FFI calls. The agent message SyntaxStyle is identical across all instances, so a singleton is the correct pattern. The diff viewer uses per-component instances because diff screens have a longer lifecycle and may need different style configurations.

**Future extension:** If user theme preferences are added, replace the module-level singleton with a context-provided instance that re-resolves on preference change.

### 9.2 ThemeProvider migration path

The interim `COLORS` constant (§3.1) must be migrated to `useTheme()` when ThemeProvider is implemented. The migration is mechanical:

1. Remove `apps/tui/src/screens/Agents/components/colors.ts`
2. Add `const theme = useTheme()` to `MessageBlockInner` and `ToolBlockInner`
3. Replace `COLORS.primary` → `theme.primary`, etc. throughout both components
4. `COLOR_TIER` for indicator selection should come from `useTheme().colorCapability` or equivalent

**To ensure this migration happens:** The `// TODO(ThemeProvider): Replace COLORS with useTheme()` comment at the `COLORS` definition site serves as a searchable marker.

### 9.3 Text attribute primitives

Use `<b>`/`<strong>` and `<em>`/`<i>` from the OpenTUI JSX namespace for bold and italic text. These are `TextNodeRenderable` subclasses (declared as `SpanProps` in `@opentui/react` JSX namespace at `context/opentui/packages/react/jsx-namespace.d.ts` lines 53–59) that automatically apply `TextAttributes.BOLD` and `TextAttributes.ITALIC` respectively via the `TextModifierRenderable` class. Do not use raw TextAttributes bit flags — the JSX elements are the correct API.

The `fg` prop on `<b>`, `<em>`, and other text modifier elements accepts `string | RGBA` per the `TextNodeOptions` interface.

### 9.4 Focus management for `x` keybinding

Parent screen (AgentChatScreen / AgentSessionReplayScreen) implements:
- `const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())`
- `const [focusedToolId, setFocusedToolId] = useState<string | null>(null)`

The parent registers `x` and `X` keybindings via `useScreenKeybindings`:

```typescript
// x: toggle focused tool block
{ key: "x", description: "expand/collapse", handler: () => {
  if (!focusedToolId) return;
  setExpandedToolIds(prev => {
    const next = new Set(prev);
    if (next.has(focusedToolId)) next.delete(focusedToolId);
    else next.add(focusedToolId);
    return next;
  });
}}

// X: toggle all tool blocks
{ key: "X", description: "expand/collapse all", handler: () => {
  const allToolIds = getAllToolIds(messages);
  const allExpanded = allToolIds.every(id => expandedToolIds.has(id));
  setExpandedToolIds(allExpanded ? new Set() : new Set(allToolIds));
}}
```

ToolBlock's `onToggle` callback is invoked by the parent when the parent delegates the toggle — ToolBlock does not capture keyboard events itself.

### 9.5 Viewport culling

Parent wraps message list in `<scrollbox viewportCulling={true}>`. Off-screen MessageBlocks are culled from the render tree by OpenTUI's native viewport culling (see `ScrollBoxRenderable` `viewportCulling` option). This is critical for agent sessions with hundreds of messages and tool calls.

Because `React.memo()` is applied to both components, re-renders are limited to:
- Messages whose `expandedToolIds` membership changes
- The currently streaming message (spinner frame updates every 100ms)
- All messages on resize (breakpoint may change)

### 9.6 Streaming lifecycle

Parent screen sets `message.streaming = false` when the SSE `done` event fires for the agent response. This triggers:
1. `useSpinner(false)` — clears the interval, returns empty string, spinner disappears
2. `<markdown streaming={false}>` — finalizes trailing token parsing in the last text part (per OpenTUI `MarkdownOptions.streaming` semantics: trailing block stabilizes when streaming is set to false)

Both cleanups happen automatically via React's reactivity. No manual cleanup code needed in MessageBlock.

### 9.7 No-color terminal fallback

When the detected color tier is `"ansi16"` (bare linux console, old xterm, dumb terminal — per `detectColorTier()` at `apps/tui/src/lib/diff-syntax.ts:114-117`):
- Unicode indicators replaced: `▶ → >`, `▼ → v`, `✓ → +`, `✗ → x`
- Colors fall back to the ANSI 16 palette (red, green, yellow, cyan, gray, white)

### 9.8 Memory efficiency

`React.memo()` on both components prevents unnecessary re-renders. Parent must:
- Provide stable `AgentMessage` object references (don't create new objects on every render)
- Use immutable Set update patterns for `expandedToolIds` (create new Set on change, never mutate)
- Provide stable `onToggleToolExpand` callback reference (wrap in `useCallback` or use a ref-stable handler)

### 9.9 Status bar hint

When a ToolBlock header has focus, the parent screen's keybinding scope shows context-sensitive hints in the status bar:
- If focused block is collapsed: `x: expand`
- If focused block is expanded: `x: collapse`
- Always: `X: expand/collapse all`

This is handled by the parent screen's keybinding registration, not by ToolBlock itself.

### 9.10 `generateSummary` exported separately

Lives in `apps/tui/src/screens/Agents/utils/generateSummary.ts` (not inlined in ToolBlock) for:
- Independent unit testability
- Reuse by other components that may need content summarization
- Exported `SUMMARY_LIMIT` constant for test assertions and documentation

---

## 10. OpenTUI Component and Hook Usage Summary

| OpenTUI JSX | Used In | Purpose | Key Props |
|-------------|---------|----------|----------|
| `<box>` | MessageBlock, ToolBlock | Layout containers, flexbox, padding, alignment | `flexDirection`, `width`, `paddingLeft`, `paddingRight`, `alignItems`, `gap`, `height` |
| `<text>` | MessageBlock, ToolBlock | Labels, timestamps, indicators, separators, error text | `fg` (`string \| RGBA`) |
| `<markdown>` | MessageBlock, ToolBlock | Body rendering (streaming supported via `MarkdownOptions.streaming`) | `content` (string), `syntaxStyle` (SyntaxStyle, **required**), `streaming` (boolean) |
| `<code>` | ToolBlock | Tool input JSON with Tree-sitter highlighting | `content` (string), `syntaxStyle` (SyntaxStyle, **required**), `filetype` (string — always `"json"`) |
| `<b>` / `<strong>` | MessageBlock, ToolBlock | Bold role labels, bold tool names | `fg` (optional, `string \| RGBA`), children (text content) |
| `<em>` / `<i>` | MessageBlock | Italic system role label and body | `fg` (optional, `string \| RGBA`), children (text content) |
| `<scrollbox>` | Parent screen (not this ticket) | Scrollable message list with viewport culling | `viewportCulling` (boolean) |

| Hook | Source | Used In | Purpose |
|------|--------|---------|----------|
| `useTerminalDimensions()` | `@opentui/react` | MessageBlock | Terminal width for separator character count |
| `useState` | `react` | MessageBlock (useSpinner) | Braille frame index for spinner animation |
| `useEffect` | `react` | MessageBlock (useSpinner) | setInterval lifecycle management |
| `React.memo()` | `react` | MessageBlock, ToolBlock | Prevent unnecessary re-renders under viewport culling |

**Note on `useTheme()`:** Not yet available. Components use `COLORS` from `colors.ts` until ThemeProvider is implemented. See §9.2 for migration path.

---

## 11. Interaction with Parent Screens

### 11.1 AgentChatScreen

Maintains the following state:
- `expandedToolIds: Set<string>` — which tool blocks are expanded
- `focusedToolId: string | null` — which tool block header currently has focus

Registers `x`/`X` screen keybindings via `useScreenKeybindings`. Renders messages in `<scrollbox viewportCulling={true}>`. Passes `expandedToolIds` and `onToggleToolExpand` to each `MessageBlock`.

The chat screen also manages the streaming lifecycle: when a new assistant message arrives via SSE with `streaming: true`, it is appended to the message list. When the SSE `done` event fires, the message's `streaming` flag is set to `false`.

### 11.2 AgentSessionReplayScreen

Identical consumption pattern. All messages have `streaming: false`. The braille spinner never activates. The replay screen may render all messages at once (no SSE streaming), making viewport culling especially important for long sessions.

---

## 12. Non-Goals for This Ticket

- `AgentChatScreen` or `AgentSessionReplayScreen` screen components
- `useAgentMessages` or `useSendAgentMessage` data hooks
- Screen registration in `screenRegistry`
- `g a` global keybinding for agent navigation
- Message input form (`TUI_AGENT_MESSAGE_SEND`)
- Session list (`TUI_AGENT_SESSION_LIST`) or creation (`TUI_AGENT_SESSION_CREATE`)
- SSE connection management for agent streams
- `useTheme()` hook implementation (see §3.1 and §9.2 for interim approach)
- ThemeProvider or color tier detection infrastructure (pre-existing in `apps/tui/src/lib/diff-syntax.ts`)
- ScrollableList or form system integration