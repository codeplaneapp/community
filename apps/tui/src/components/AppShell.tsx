import React from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint } from "../types/breakpoint.js";
import { HeaderBar } from "./HeaderBar.js";
import { StatusBar } from "./StatusBar.js";
import { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";

export function AppShell({ children }: { children?: React.ReactNode }) {
  const { width, height } = useTerminalDimensions();
  const bp = getBreakpoint(width, height);

  if (bp === null) {
    return <TerminalTooSmallScreen cols={width} rows={height} />;
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <HeaderBar />
      <box flexGrow={1} width="100%">
        {children}
      </box>
      <StatusBar />
    </box>
  );
}
