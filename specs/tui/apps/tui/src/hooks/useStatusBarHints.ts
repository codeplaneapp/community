import { useContext } from "react";
import { StatusBarHintsContext } from "../providers/KeybindingProvider.js";
import type { StatusBarHintsContextType, StatusBarHint } from "../providers/keybinding-types.js";

/** Read the current status bar hints. Used by the StatusBar component. */
export function useStatusBarHints(): StatusBarHintsContextType {
  const ctx = useContext(StatusBarHintsContext);
  if (!ctx) throw new Error("useStatusBarHints must be used within a KeybindingProvider");
  return ctx;
}

export type { StatusBarHint, StatusBarHintsContextType };
