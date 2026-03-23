import React, { useCallback } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();

  const onQuit = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); }
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
  const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);
  const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });
  return <>{children}</>;
}
