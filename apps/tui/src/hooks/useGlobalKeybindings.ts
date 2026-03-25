import { useContext, useEffect, useMemo } from "react";
import { KeybindingContext } from "../providers/KeybindingProvider.js";
import { type KeyHandler, PRIORITY } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";

export interface GlobalKeybindingActions {
  onQuit: () => void;
  onEscape: () => void;
  onForceQuit: () => void;
  onHelp: () => void;
  onCommandPalette: () => void;
  onGoTo: () => void;
  onToggleSidebar: () => void;
}

/**
 * Register always-active global keybindings (Priority 5 — fallback layer).
 * Call once in the AppShell component.
 */
export function useGlobalKeybindings(actions: GlobalKeybindingActions): void {
  const ctx = useContext(KeybindingContext);
  if (!ctx) throw new Error("useGlobalKeybindings must be used within a KeybindingProvider");

  const bindingsMap = useMemo(() => {
    const map = new Map<string, KeyHandler>();
    const globals: KeyHandler[] = [
      { key: normalizeKeyDescriptor("q"),      description: "Back / Quit",     group: "Global", handler: actions.onQuit },
      { key: normalizeKeyDescriptor("escape"), description: "Close / Back",    group: "Global", handler: actions.onEscape },
      { key: normalizeKeyDescriptor("ctrl+c"), description: "Quit TUI",        group: "Global", handler: actions.onForceQuit },
      { key: normalizeKeyDescriptor("ctrl+b"), description: "Toggle sidebar",  group: "Global", handler: actions.onToggleSidebar },
      { key: normalizeKeyDescriptor("?"),      description: "Toggle help",     group: "Global", handler: actions.onHelp },
      { key: normalizeKeyDescriptor(":"),      description: "Command palette", group: "Global", handler: actions.onCommandPalette },
      { key: normalizeKeyDescriptor("g"),      description: "Go-to mode",      group: "Global", handler: actions.onGoTo },
    ];
    for (const h of globals) map.set(h.key, h);
    return map;
  }, [actions]);

  useEffect(() => {
    const scopeId = ctx.registerScope({ priority: PRIORITY.GLOBAL, bindings: bindingsMap, active: true });
    return () => { ctx.removeScope(scopeId); };
  }, [ctx, bindingsMap]);
}
