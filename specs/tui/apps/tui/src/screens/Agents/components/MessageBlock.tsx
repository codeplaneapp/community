import React from "react";
import { useTerminalDimensions } from "@opentui/react";
import type { AgentMessage, Breakpoint, MessageRole, MessagePart } from "../types.js";
import { formatTimestamp } from "../utils/formatTimestamp.js";
import { defaultSyntaxStyle } from "../../../theme/syntaxStyle.js";
import { useSpinner } from "../../../hooks/useSpinner.js";
import { ToolBlock } from "./ToolBlock.js";
import { useTheme } from "../../../hooks/useTheme.js";
import { ThemeTokens } from "../../../theme/tokens.js";

export interface MessageBlockProps {
  message: AgentMessage;
  breakpoint: Breakpoint;
  showSeparator?: boolean;
  expandedToolIds?: Set<string>;
  onToggleToolExpand?: (toolId: string) => void;
}

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

function renderRoleLabel(
  role: MessageRole,
  label: string,
  spinner: string,
  theme: Readonly<ThemeTokens>
): React.ReactNode {
  switch (role) {
    case "user":
      return <text fg={theme.primary}><b>{label}</b></text>;
    case "assistant":
      return (
        <text fg={theme.success}>
          {spinner && <>{spinner} </>}
          <b>{label}</b>
        </text>
      );
    case "system":
      return <text fg={theme.muted}><em>{label}</em></text>;
    case "tool":
      return null;
  }
}

function MessageBlockInner({
  message,
  breakpoint,
  showSeparator = true,
  expandedToolIds,
  onToggleToolExpand,
}: MessageBlockProps) {
  const { width } = useTerminalDimensions();
  const theme = useTheme();
  const padding = PADDING_CONFIG[breakpoint];
  const spinner = useSpinner(
    message.role === "assistant" && !!message.streaming
  );

  const labelConfig = LABEL_CONFIG[message.role][breakpoint];
  const timestamp = formatTimestamp(message.timestamp, breakpoint);

  const alignment =
    message.role === "system" ? "center" : "flex-start";

  const separatorWidth = Math.max(0, width - padding.left - padding.right);

  const lastTextIndex = message.parts.reduceRight(
    (acc, p, i) => (acc === -1 && p.type === "text" ? i : acc), -1
  );

  return (
    <box
      flexDirection="column"
      width="100%"
      paddingLeft={padding.left}
      paddingRight={padding.right}
      alignItems={alignment}
    >
      {message.role !== "tool" && labelConfig.label && (
        <box flexDirection="row" gap={1} width="100%">
          {renderRoleLabel(message.role, labelConfig.label, spinner, theme)}
          {timestamp && (
            <text fg={theme.muted}>{timestamp}</text>
          )}
        </box>
      )}

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
              <text key={`unknown-${index}`} fg={theme.muted}>
                [unknown part type]
              </text>
            );
          }
        }
      })}

      {showSeparator && (
        <box height={1} width="100%">
          <text fg={theme.border}>
            {"─".repeat(separatorWidth)}
          </text>
        </box>
      )}
    </box>
  );
}

export const MessageBlock = React.memo(MessageBlockInner);
