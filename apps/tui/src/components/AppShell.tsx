import React from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { TextAttributes } from "../theme/tokens.js";
import { HeaderBar } from "./HeaderBar.js";
import { StatusBar } from "./StatusBar.js";
import { OverlayLayer } from "./OverlayLayer.js";
import { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";

export function AppShell({ children }: { children?: React.ReactNode }) {
  const layout = useLayout();
  const theme = useTheme();

  if (!layout.breakpoint) {
    return <TerminalTooSmallScreen cols={layout.width} rows={layout.height} />;
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <HeaderBar />
      <box flexGrow={1} width="100%" flexDirection="row">
        {layout.sidebarVisible && (
          <box
            width={layout.sidebarWidth}
            border={["right"]}
            borderStyle="single"
            borderColor={theme.border}
            padding={1}
            flexDirection="column"
          >
            <text fg={theme.primary} attributes={TextAttributes.BOLD}>Navigation</text>
            <text fg={theme.muted}>Dashboard</text>
            <text fg={theme.muted}>Repositories</text>
            <text fg={theme.muted}>Search</text>
            <text fg={theme.muted}>Workspaces</text>
          </box>
        )}
        <box flexGrow={1} width={layout.sidebarVisible ? undefined : "100%"}>
          {children}
        </box>
      </box>
      <StatusBar />
      <OverlayLayer />
    </box>
  );
}
