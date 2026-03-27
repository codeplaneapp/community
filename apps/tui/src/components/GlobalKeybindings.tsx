import React, { useCallback, useContext, useEffect, useRef } from "react";
import { useNavigation } from "../hooks/useNavigation.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";
import { useOverlay } from "../hooks/useOverlay.js";
import { useSidebarState } from "../hooks/useSidebarState.js";
import { executeGoTo, goToBindings } from "../navigation/goToBindings.js";
import { KeybindingContext, StatusBarHintsContext } from "../providers/KeybindingProvider.js";
import { PRIORITY, type KeyHandler } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";

const GO_TO_TIMEOUT_MS = 1_500;

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const overlay = useOverlay();
  const sidebar = useSidebarState();
  const keybindingCtx = useContext(KeybindingContext);
  const statusBarCtx = useContext(StatusBarHintsContext);

  if (!keybindingCtx) {
    throw new Error("GlobalKeybindings must be used within a KeybindingProvider");
  }
  if (!statusBarCtx) {
    throw new Error("GlobalKeybindings must be used within StatusBarHintsContext");
  }

  const goToScopeIdRef = useRef<string | null>(null);
  const goToHintsCleanupRef = useRef<(() => void) | null>(null);
  const goToTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGoToMode = useCallback(() => {
    if (goToScopeIdRef.current) {
      keybindingCtx.removeScope(goToScopeIdRef.current);
      goToScopeIdRef.current = null;
    }
    if (goToHintsCleanupRef.current) {
      goToHintsCleanupRef.current();
      goToHintsCleanupRef.current = null;
    }
    if (goToTimeoutRef.current) {
      clearTimeout(goToTimeoutRef.current);
      goToTimeoutRef.current = null;
    }
  }, [keybindingCtx]);

  useEffect(() => {
    return () => {
      if (goToScopeIdRef.current) {
        keybindingCtx.removeScope(goToScopeIdRef.current);
        goToScopeIdRef.current = null;
      }
      if (goToHintsCleanupRef.current) {
        goToHintsCleanupRef.current();
        goToHintsCleanupRef.current = null;
      }
      if (goToTimeoutRef.current) {
        clearTimeout(goToTimeoutRef.current);
        goToTimeoutRef.current = null;
      }
    };
    // keybindingCtx.removeScope is stable from KeybindingProvider.
    // We only want this cleanup on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onQuit = useCallback(() => {
    if (nav.canPop()) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (nav.canPop()) { nav.pop(); }
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { overlay.openOverlay("help"); }, [overlay]);
  const onCommandPalette = useCallback(() => { overlay.openOverlay("command-palette"); }, [overlay]);
  const onGoTo = useCallback(() => {
    clearGoToMode();

    let repoContext: { owner: string; repo: string } | null = null;
    for (let i = nav.stack.length - 1; i >= 0; i -= 1) {
      const params = nav.stack[i]?.params;
      if (params?.owner && params?.repo) {
        repoContext = { owner: params.owner, repo: params.repo };
        break;
      }
    }

    const goToBindingsMap = new Map<string, KeyHandler>();
    for (const binding of goToBindings) {
      const key = normalizeKeyDescriptor(binding.key);
      goToBindingsMap.set(key, {
        key,
        description: `Go to ${binding.description}`,
        group: "Go-to",
        handler: () => {
          executeGoTo(nav, binding, repoContext);
          clearGoToMode();
        },
      });
    }

    const escapeKey = normalizeKeyDescriptor("escape");
    goToBindingsMap.set(escapeKey, {
      key: escapeKey,
      description: "Cancel go-to",
      group: "Go-to",
      handler: clearGoToMode,
    });

    goToScopeIdRef.current = keybindingCtx.registerScope({
      priority: PRIORITY.GOTO,
      bindings: goToBindingsMap,
      active: true,
    });

    goToHintsCleanupRef.current = statusBarCtx.overrideHints([
      { keys: "g d", label: "dashboard", order: 0 },
      { keys: "g r", label: "repositories", order: 10 },
      { keys: "g n", label: "notifications", order: 20 },
      { keys: "g s", label: "search", order: 30 },
      { keys: "Esc", label: "cancel", order: 90 },
    ]);

    goToTimeoutRef.current = setTimeout(clearGoToMode, GO_TO_TIMEOUT_MS);
  }, [clearGoToMode, keybindingCtx, nav, statusBarCtx]);
  const onToggleSidebar = useCallback(() => { sidebar.toggle(); }, [sidebar]);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo, onToggleSidebar });
  return <>{children}</>;
}
