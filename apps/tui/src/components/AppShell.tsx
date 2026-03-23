import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint } from "../types/breakpoint.js";
import { HeaderBar } from "./HeaderBar.js";
import { StatusBar } from "./StatusBar.js";
import { ScreenRouter } from "../router/ScreenRouter.js";
import { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";

export function AppShell() {
  const { width, height } = useTerminalDimensions();
  const breakpoint = getBreakpoint(width, height);

  if (breakpoint === null) {
    return <TerminalTooSmallScreen cols={width} rows={height} />;
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <HeaderBar />
      <box flexGrow={1} width="100%">
        <ScreenRouter />
      </box>
      <StatusBar />
    </box>
  );
}