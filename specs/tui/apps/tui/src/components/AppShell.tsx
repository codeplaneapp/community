import React from "react";
import { useLayout } from "../hooks/useLayout.js";
import { HeaderBar } from "./HeaderBar.js";
import { StatusBar } from "./StatusBar.js";
import { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";

interface AppShellProps {
  children?: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const layout = useLayout();

  if (!layout.breakpoint) {
    return <TerminalTooSmallScreen cols={layout.width} rows={layout.height} />;
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