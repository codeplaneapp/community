import { useContext, useEffect, useRef, useMemo } from "react";
import { KeybindingContext, StatusBarHintsContext } from "../providers/KeybindingProvider.js";
import { type KeyHandler, type StatusBarHint, PRIORITY } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";

/**
 * Register screen-specific keybindings and status bar hints.
 * Pushes PRIORITY.SCREEN scope on mount, pops on unmount.
 *
 * @example
 * useScreenKeybindings([
 *   { key: "j", description: "Navigate down", group: "Navigation", handler: moveDown },
 *   { key: "k", description: "Navigate up",   group: "Navigation", handler: moveUp },
 *   { key: "Enter", description: "Open",       group: "Actions",    handler: open },
 * ]);
 */
export function useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void {
  const keybindingCtx = useContext(KeybindingContext);
  const statusBarCtx = useContext(StatusBarHintsContext);
  if (!keybindingCtx) throw new Error("useScreenKeybindings must be used within a KeybindingProvider");
  if (!statusBarCtx) throw new Error("useScreenKeybindings: StatusBarHintsContext missing");

  // Ref ensures handlers are always fresh without re-registering scope
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const bindingsMap = useMemo(() => {
    const map = new Map<string, KeyHandler>();
    for (const binding of bindings) {
      const key = normalizeKeyDescriptor(binding.key);
      map.set(key, {
        ...binding, key,
        handler: () => bindingsRef.current.find((b) => normalizeKeyDescriptor(b.key) === key)?.handler(),
      });
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings.map((b) => b.key).join(",")]);

  // Register keybinding scope
  useEffect(() => {
    const scopeId = keybindingCtx.registerScope({ priority: PRIORITY.SCREEN, bindings: bindingsMap, active: true });
    return () => { keybindingCtx.removeScope(scopeId); };
  }, [keybindingCtx, bindingsMap]);

  // Register status bar hints
  useEffect(() => {
    const sourceId = `screen_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const resolved: StatusBarHint[] = hints ?? bindings.slice(0, 8).map((b, i) => ({
      keys: b.key, label: b.description.toLowerCase(), order: i * 10,
    }));
    return statusBarCtx.registerHints(sourceId, resolved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusBarCtx, hints, bindings.map((b) => b.key).join(",")]);
}
