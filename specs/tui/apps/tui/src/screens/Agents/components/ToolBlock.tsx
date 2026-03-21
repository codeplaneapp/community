import React from "react";
import type { Breakpoint } from "../types.js";
import { useTheme } from "../../../hooks/useTheme.js";
import { useColorTier } from "../../../hooks/useColorTier.js";
import { defaultSyntaxStyle } from "../../../theme/syntaxStyle.js";
import { generateSummary } from "../utils/generateSummary.js";

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

const MAX_CONTENT_BYTES = 64 * 1024; // 64KB
const TRUNCATION_NOTICE = "\n… (truncated — content exceeds 64KB)";

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_BYTES) return content;
  return content.slice(0, MAX_CONTENT_BYTES) + TRUNCATION_NOTICE;
}

const MAX_TOOL_NAME_LENGTH = 50;

function truncateToolName(name: string): string {
  if (name.length <= MAX_TOOL_NAME_LENGTH) return name;
  return name.slice(0, MAX_TOOL_NAME_LENGTH - 1) + "…";
}

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

function ToolBlockInner(props: ToolBlockProps) {
  const theme = useTheme();
  const tier = useColorTier();
  const indicators = tier === "ansi16" ? ASCII_INDICATORS : UNICODE_INDICATORS;
  const summaryContent = props.variant === "call" ? props.input : props.output;
  const summary = generateSummary(summaryContent, props.breakpoint);

  if (!props.expanded) {
    return (
      <box flexDirection="row">
        {props.variant === "result" && (
          <text fg={props.isError ? theme.error : theme.success}>
            {props.isError ? indicators.error : indicators.success}{" "}
          </text>
        )}
        <text fg={theme.warning}>{indicators.collapsed} </text>
        <text fg={theme.warning}><b>{truncateToolName(props.toolName)}</b></text>
        {summary && (
          <text fg={theme.muted}> — {summary}</text>
        )}
      </box>
    );
  }

  return (
    <box flexDirection="column">
      <box flexDirection="row">
        {props.variant === "result" && (
          <text fg={props.isError ? theme.error : theme.success}>
            {props.isError ? indicators.error : indicators.success}{" "}
          </text>
        )}
        <text fg={theme.warning}>{indicators.expanded} </text>
        <text fg={theme.warning}><b>{truncateToolName(props.toolName)}</b></text>
      </box>

      <box paddingLeft={2}>
        {props.variant === "call" ? (
          <box flexDirection="column">
            <text fg={theme.muted}>Input:</text>
            <code
              content={truncateContent(props.input)}
              filetype="json"
              syntaxStyle={defaultSyntaxStyle}
            />
          </box>
        ) : props.isError ? (
          <box flexDirection="column">
            <text fg={theme.error}>Error:</text>
            <text fg={theme.error}>{truncateContent(props.output)}</text>
          </box>
        ) : (
          <box flexDirection="column">
            <text fg={theme.muted}>Result:</text>
            <markdown
              content={truncateContent(props.output)}
              syntaxStyle={defaultSyntaxStyle}
            />
          </box>
        )}
      </box>
    </box>
  );
}

export const ToolBlock = React.memo(ToolBlockInner);
