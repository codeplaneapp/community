import { useKeyboard } from "@opentui/react";

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
      <text fg="#CA8A04">Terminal too small</text>
      <text fg="#A3A3A3">
        Minimum size: 80×24 — Current: {cols}×{rows}
      </text>
      <text fg="#A3A3A3">Resize your terminal to continue.</text>
    </box>
  );
}
