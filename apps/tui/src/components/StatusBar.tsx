import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { statusToToken } from "../theme/tokens.js";

export function StatusBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();

  const syncState = "connected"; // placeholder
  const syncColor = theme[statusToToken(syncState)];
  const syncLabel = syncState === "connected" ? "synced" : syncState;

  const showFullHints = breakpoint !== "minimum";

  return (
    <box flexDirection="row" height={1} width="100%" borderColor={theme.border} border={["top"]}>
      <box flexGrow={1} flexDirection="row">
        {showFullHints && (
          <>
            <text fg={theme.primary}>j/k</text>
            <text fg={theme.muted}>:navigate  </text>
            <text fg={theme.primary}>Enter</text>
            <text fg={theme.muted}>:select  </text>
          </>
        )}
        <text fg={theme.primary}>q</text>
        <text fg={theme.muted}>:back  </text>
        <text fg={theme.primary}>?</text>
        <text fg={theme.muted}>:help</text>
      </box>
      <box>
        <text fg={syncColor}>{syncLabel}</text>
      </box>
      <box>
        <text fg={theme.muted}>  </text>
        <text fg={theme.primary}>?</text>
        <text fg={theme.muted}> help</text>
      </box>
    </box>
  );
}
