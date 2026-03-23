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

  const closeOverlay = useCallback(() => {
    setActiveOverlay((prev) => {
      if (prev === null) return null;

      if (modalScopeIdRef.current) {
        keybindingCtx.removeScope(modalScopeIdRef.current);
        modalScopeIdRef.current = null;
      }

      if (hintsCleanupRef.current) {
        hintsCleanupRef.current();
        hintsCleanupRef.current = null;
      }

      if (prev === "confirm") {
        setConfirmPayload((p) => {
          p?.onCancel?.();
          return null;
        });
      } else {
        setConfirmPayload(null);
      }

      return null;
    });
  }, [keybindingCtx]);

  const closeOverlayRef = useRef(closeOverlay);
  closeOverlayRef.current = closeOverlay;

  const openOverlay = useCallback(
    (type: OverlayType, payload?: ConfirmPayload) => {
      setActiveOverlay((prev) => {
        if (prev === type) {
          if (modalScopeIdRef.current) {
            keybindingCtx.removeScope(modalScopeIdRef.current);
            modalScopeIdRef.current = null;
          }
          if (hintsCleanupRef.current) {
            hintsCleanupRef.current();
            hintsCleanupRef.current = null;
          }
          setConfirmPayload(null);
          return null;
        }

        if (prev !== null && modalScopeIdRef.current) {
          keybindingCtx.removeScope(modalScopeIdRef.current);
          modalScopeIdRef.current = null;
        }
        if (hintsCleanupRef.current) {
          hintsCleanupRef.current();
          hintsCleanupRef.current = null;
        }

        if (type === "confirm" && payload) {
          setConfirmPayload(payload);
        } else {
          setConfirmPayload(null);
        }

        const escapeBinding: KeyHandler = {
          key: normalizeKeyDescriptor("escape"),
          description: "Close overlay",
          group: "Overlay",
          handler: () => closeOverlayRef.current(),
        };

        const bindings = new Map<string, KeyHandler>();
        bindings.set(escapeBinding.key, escapeBinding);

        const scopeId = keybindingCtx.registerScope({
          priority: PRIORITY.MODAL,
          bindings,
          active: true,
        });
        modalScopeIdRef.current = scopeId;

        const overlayHints: StatusBarHint[] = [
          { keys: "Esc", label: "close", order: 0 },
        ];
        hintsCleanupRef.current = statusBarCtx.overrideHints(overlayHints);

        return type;
      });
    },
    [keybindingCtx, statusBarCtx],
  );

  useEffect(() => {
    return () => {
      if (modalScopeIdRef.current) {
        keybindingCtx.removeScope(modalScopeIdRef.current);
      }
      if (hintsCleanupRef.current) {
        hintsCleanupRef.current();
      }
    };
  }, [keybindingCtx]);

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
