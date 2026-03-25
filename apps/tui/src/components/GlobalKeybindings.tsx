import React, { useCallback } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";
import { useOverlay } from "../hooks/useOverlay.js";
import { useSidebarState } from "../hooks/useSidebarState.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const overlay = useOverlay();
  const sidebar = useSidebarState();

  const onQuit = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); }
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { overlay.openOverlay("help"); }, [overlay]);
  const onCommandPalette = useCallback(() => { overlay.openOverlay("command-palette"); }, [overlay]);
  const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);
  const onToggleSidebar = useCallback(() => { sidebar.toggle(); }, [sidebar]);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo, onToggleSidebar });
  return <>{children}</>;
}
