import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";

export function StatusBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();

  const allHints = "j/k:navigate  Enter:select  q:back  ?:help  ::command";
  const minHints = "q:back  ?:help";
  const hints = breakpoint === "minimum" ? minHints : allHints;

  const syncStatus = "synced";
  const rightText = `${syncStatus}  ? help`;
  const maxLeftWidth = Math.max(10, width - rightText.length - 2);

  return (
    <box flexDirection="row" height={1} width="100%">
      <box flexGrow={1}>
        <text fg={theme.muted}>{truncateRight(hints, maxLeftWidth)}</text>
      </box>
      <box>
        <text fg={theme.success}>{syncStatus}</text>
      </box>
      <box>
        <text fg={theme.muted}>  ? help</text>
      </box>
    </box>
  );
}
