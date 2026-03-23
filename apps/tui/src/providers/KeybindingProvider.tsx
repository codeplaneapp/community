import { createContext, useCallback, useRef, useState, type ReactNode } from "react";
import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
import {
  type KeybindingContextType,
  type KeybindingScope,
  type KeyHandler,
  type StatusBarHintsContextType,
  type StatusBarHint,
  PRIORITY,
} from "./keybinding-types.js";
import { normalizeKeyEvent } from "./normalize-key.js";

export const KeybindingContext = createContext<KeybindingContextType | null>(null);
export const StatusBarHintsContext = createContext<StatusBarHintsContextType | null>(null);

interface KeybindingProviderProps {
  children: ReactNode;
}

export function KeybindingProvider({ children }: KeybindingProviderProps) {
  // Ref + version counter pattern: ref holds scopes for stable dispatch,
  // version counter triggers re-renders for consumers reading bindings.
  const scopesRef = useRef<Map<string, KeybindingScope>>(new Map());
  const [scopeVersion, setScopeVersion] = useState(0);
  const nextIdRef = useRef(0);

  const bumpVersion = useCallback(() => setScopeVersion((v) => v + 1), []);

  const registerScope = useCallback(
    (scopeInit: Omit<KeybindingScope, "id">): string => {
      const id = `scope_${nextIdRef.current++}`;
      scopesRef.current.set(id, { ...scopeInit, id });
      bumpVersion();
      return id;
    },
    [bumpVersion],
  );

  const removeScope = useCallback(
    (id: string): void => {
      if (scopesRef.current.delete(id)) bumpVersion();
    },
    [bumpVersion],
  );

  const setActive = useCallback(
    (id: string, active: boolean): void => {
      const scope = scopesRef.current.get(id);
      if (scope && scope.active !== active) {
        scope.active = active;
        bumpVersion();
      }
    },
    [bumpVersion],
  );

  /** Active scopes sorted by priority ASC, then LIFO within same priority. */
  const getActiveScopesSorted = useCallback((): KeybindingScope[] => {
    const scopes = Array.from(scopesRef.current.values()).filter((s) => s.active);
    scopes.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aNum = parseInt(a.id.split("_")[1], 10);
      const bNum = parseInt(b.id.split("_")[1], 10);
      return bNum - aNum; // LIFO for same priority
    });
    return scopes;
  }, []);

  // Single useKeyboard() call — ALL input flows through here
  useKeyboard((event: KeyEvent) => {
    if (event.eventType === "release") return;

    const descriptor = normalizeKeyEvent(event);
    const scopes = getActiveScopesSorted();

    for (const scope of scopes) {
      const handler = scope.bindings.get(descriptor);
      if (handler) {
        if (handler.when && !handler.when()) continue; // Skip, try next
        handler.handler();
        event.preventDefault();
        event.stopPropagation();
        return; // First match wins
      }
    }
    // No match — falls through to OpenTUI focused component
  });

  const getAllBindings = useCallback((): Map<string, KeyHandler[]> => {
    void scopeVersion;
    const groups = new Map<string, KeyHandler[]>();
    for (const scope of getActiveScopesSorted()) {
      for (const handler of scope.bindings.values()) {
        const existing = groups.get(handler.group) ?? [];
        if (!existing.some((h) => h.key === handler.key)) {
          existing.push(handler);
          groups.set(handler.group, existing);
        }
      }
    }
    return groups;
  }, [getActiveScopesSorted, scopeVersion]);

  const getScreenBindings = useCallback((): KeyHandler[] => {
    void scopeVersion;
    const screenScopes = Array.from(scopesRef.current.values()).filter(
      (s) => s.active && s.priority === PRIORITY.SCREEN,
    );
    if (screenScopes.length === 0) return [];
    const latest = screenScopes.reduce((a, b) => {
      return parseInt(b.id.split("_")[1], 10) > parseInt(a.id.split("_")[1], 10) ? b : a;
    });
    return Array.from(latest.bindings.values());
  }, [scopeVersion]);

  const hasActiveModal = useCallback((): boolean => {
    for (const scope of scopesRef.current.values()) {
      if (scope.active && scope.priority === PRIORITY.MODAL) return true;
    }
    return false;
  }, []);

  // ── Status bar hints ────────────────────────────────────────────
  const [hintSources, setHintSources] = useState<Map<string, StatusBarHint[]>>(new Map());
  const [overrideHintsState, setOverrideHintsState] = useState<StatusBarHint[] | null>(null);

  const registerHints = useCallback(
    (sourceId: string, hints: StatusBarHint[]): (() => void) => {
      setHintSources((prev) => new Map(prev).set(sourceId, hints));
      return () => setHintSources((prev) => { const n = new Map(prev); n.delete(sourceId); return n; });
    },
    [],
  );

  const overrideHints = useCallback(
    (hints: StatusBarHint[]): (() => void) => {
      setOverrideHintsState(hints);
      return () => setOverrideHintsState(null);
    },
    [],
  );

  const resolvedHints: StatusBarHint[] = (() => {
    if (overrideHintsState) return overrideHintsState;
    const all: StatusBarHint[] = [];
    for (const h of hintSources.values()) all.push(...h);
    all.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    return all;
  })();

  return (
    <KeybindingContext.Provider value={{
      registerScope, removeScope, setActive,
      getAllBindings, getScreenBindings, hasActiveModal,
    }}>
      <StatusBarHintsContext.Provider value={{
        hints: resolvedHints, registerHints, overrideHints,
        isOverridden: overrideHintsState !== null,
      }}>
        {children}
      </StatusBarHintsContext.Provider>
    </KeybindingContext.Provider>
  );
}
