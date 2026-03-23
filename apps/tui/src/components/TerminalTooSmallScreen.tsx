import { useKeyboard } from "@opentui/react";
import { detectColorCapability } from "../theme/detect.js";
import { createTheme } from "../theme/tokens.js";

const fallbackTheme = createTheme(detectColorCapability());

export function TerminalTooSmallScreen({ cols, rows }: { cols: number; rows: number }) {
  useKeyboard((event: { name: string; ctrl?: boolean }) => {
    if (event.name === "q" || (event.name === "c" && event.ctrl)) {
      process.exit(0);
    }
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
    >
      <text fg={fallbackTheme.warning}>Terminal too small</text>
      <text fg={fallbackTheme.muted}>
        Minimum size: 80×24 — Current: {cols}×{rows}
      </text>
      <text fg={fallbackTheme.muted}>Resize your terminal to continue.</text>
    </box>
  );
}
