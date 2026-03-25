import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { KeybindingContext, StatusBarHintsContext } from "./KeybindingProvider.js";
import { PRIORITY, type KeyHandler, type StatusBarHint } from "./keybinding-types.js";
import { normalizeKeyDescriptor } from "./normalize-key.js";
import type {
  OverlayContextType,
  OverlayState,
  OverlayType,
  ConfirmPayload,
} from "./overlay-types.js";

export const OverlayContext = createContext<OverlayContextType | null>(null);

interface OverlayManagerProps {
  children: ReactNode;
}

export function OverlayManager({ children }: OverlayManagerProps) {
  const [activeOverlay, setActiveOverlay] = useState<OverlayState>(null);
  const [confirmPayload, setConfirmPayload] = useState<ConfirmPayload | null>(null);

  const keybindingCtx = useContext(KeybindingContext);
  const statusBarCtx = useContext(StatusBarHintsContext);

  if (!keybindingCtx) {
    throw new Error("OverlayManager must be used within a KeybindingProvider");
  }
  if (!statusBarCtx) {
    throw new Error("OverlayManager must be used within a StatusBarHintsContext");
  }

  const modalScopeIdRef = useRef<string | null>(null);
  const hintsCleanupRef = useRef<(() => void) | null>(null);

  const cleanupModalState = useCallback(() => {
    if (modalScopeIdRef.current) {
      keybindingCtx.removeScope(modalScopeIdRef.current);
      modalScopeIdRef.current = null;
    }
    if (hintsCleanupRef.current) {
      hintsCleanupRef.current();
      hintsCleanupRef.current = null;
    }
  }, [keybindingCtx]);

  const closeOverlay = useCallback(() => {
    if (activeOverlay === "confirm") {
      confirmPayload?.onCancel?.();
    }
    setConfirmPayload(null);
    setActiveOverlay(null);
  }, [activeOverlay, confirmPayload]);

  const openOverlay = useCallback(
    (type: OverlayType, payload?: ConfirmPayload) => {
      if (activeOverlay === type) {
        if (type === "confirm") {
          confirmPayload?.onCancel?.();
        }
        setConfirmPayload(null);
        setActiveOverlay(null);
        return;
      }

      if (activeOverlay === "confirm") {
        confirmPayload?.onCancel?.();
      }

      setConfirmPayload(type === "confirm" ? payload ?? null : null);
      setActiveOverlay(type);
    },
    [activeOverlay, confirmPayload],
  );

  useEffect(() => {
    cleanupModalState();

    if (!activeOverlay) {
      return cleanupModalState;
    }

    const closeBinding: KeyHandler = {
      key: normalizeKeyDescriptor("escape"),
      description: "Close overlay",
      group: "Overlay",
      handler: closeOverlay,
    };
    const helpBinding: KeyHandler = {
      key: normalizeKeyDescriptor("?"),
      description: "Toggle help",
      group: "Overlay",
      handler: () => openOverlay("help"),
    };
    const commandPaletteBinding: KeyHandler = {
      key: normalizeKeyDescriptor(":"),
      description: "Toggle command palette",
      group: "Overlay",
      handler: () => openOverlay("command-palette"),
    };
    const forceQuitBinding: KeyHandler = {
      key: normalizeKeyDescriptor("ctrl+c"),
      description: "Quit TUI",
      group: "Overlay",
      handler: () => process.exit(0),
    };
    const consumeBindings: KeyHandler[] = [
      {
        key: normalizeKeyDescriptor("q"),
        description: "Block global quit",
        group: "Overlay",
        handler: () => {},
        consumeOnly: true,
      },
      {
        key: normalizeKeyDescriptor("g"),
        description: "Block go-to mode",
        group: "Overlay",
        handler: () => {},
        consumeOnly: true,
      },
      {
        key: normalizeKeyDescriptor("ctrl+b"),
        description: "Block sidebar toggle",
        group: "Overlay",
        handler: () => {},
        consumeOnly: true,
      },
    ];

    const bindings = new Map<string, KeyHandler>();
    bindings.set(closeBinding.key, closeBinding);
    bindings.set(helpBinding.key, helpBinding);
    bindings.set(commandPaletteBinding.key, commandPaletteBinding);
    bindings.set(forceQuitBinding.key, forceQuitBinding);
    for (const binding of consumeBindings) {
      bindings.set(binding.key, binding);
    }

    modalScopeIdRef.current = keybindingCtx.registerScope({
      priority: PRIORITY.MODAL,
      bindings,
      active: true,
    });
    hintsCleanupRef.current = statusBarCtx.overrideHints([
      { keys: "Esc", label: "close", order: 0 },
    ]);

    return cleanupModalState;
  }, [activeOverlay, cleanupModalState, closeOverlay, keybindingCtx, openOverlay, statusBarCtx]);

  useEffect(() => {
    return cleanupModalState;
  }, [cleanupModalState]);

  const isOpen = useCallback(
    (type: OverlayType): boolean => activeOverlay === type,
    [activeOverlay],
  );

  const contextValue: OverlayContextType = {
    activeOverlay,
    openOverlay,
    closeOverlay,
    isOpen,
    confirmPayload,
  };

  return (
    <OverlayContext.Provider value={contextValue}>
      {children}
    </OverlayContext.Provider>
  );
}
