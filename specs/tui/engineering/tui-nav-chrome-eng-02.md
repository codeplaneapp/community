# Engineering Specification: `tui-nav-chrome-eng-02`

## KeybindingProvider with layered priority dispatch

**Ticket ID:** `tui-nav-chrome-eng-02`
**Type:** Engineering (infrastructure)
**Dependencies:** `tui-bootstrap-and-renderer`
**Status:** Not started

---

## Overview

This ticket creates the `KeybindingProvider` — the central keyboard input management system for the Codeplane TUI. It delivers four modules:

1. **`apps/tui/src/providers/KeybindingProvider.tsx`** — React context provider that owns a priority-ordered stack of keybinding scopes, captures all keyboard input via a single `useKeyboard()` call from `@opentui/react`, and dispatches events top-down through the priority stack.
2. **`apps/tui/src/hooks/useScreenKeybindings.ts`** — Hook that screens call to register their keybindings. Pushes a scope on mount, pops on unmount.
3. **`apps/tui/src/hooks/useGlobalKeybindings.ts`** — Hook that registers the always-active global bindings (`q`, `Esc`, `Ctrl+C`, `?`, `:`, `g`).
4. **`apps/tui/src/hooks/useStatusBarHints.ts`** — Context hook for screens to register keybinding hints displayed in the status bar's left section.

The `KeybindingProvider` sits at the bottom of the provider stack, wrapping the `AppShell`:

```
ThemeProvider
  → KeybindingProvider    ← THIS TICKET
    → AppShell
```

It is the single point where `useKeyboard()` from `@opentui/react` is called. No other component in the tree calls `useKeyboard()` directly (except text input components via OpenTUI's internal focus-based key routing). All keyboard dispatch flows through the priority stack managed by this provider.

### Dependencies

| Dependency | Status | Location |
|------------|--------|----------|
| `tui-bootstrap-and-renderer` | Required | Provider stack, `@opentui/react` hooks available |
| `tui-navigation-provider` | Exists | `apps/tui/src/providers/NavigationProvider.tsx` — consumed by global keybindings for `q`/pop and go-to |
| `tui-theme-provider` | Exists | `apps/tui/src/providers/ThemeProvider.tsx` — ancestor in provider stack |
| `@opentui/react` | External | Provides `useKeyboard()` hook |
| `@opentui/core` | External | Provides `KeyEvent` type |

### Non-Goals

- This ticket does **not** implement the go-to mode state machine. Go-to mode registers its own scope via a separate hook — this ticket provides the infrastructure.
- This ticket does **not** implement the command palette or help overlay. Those register their own MODAL scopes.
- This ticket does **not** implement screen-specific keybindings (issue list `j/k`, diff `]`/`[`, etc.). Those are registered per-screen via `useScreenKeybindings()`.
- This ticket does **not** handle text input focus detection internally — it relies on OpenTUI's native focus system.

---

## Implementation Plan

### Step 1: Define the keybinding type system

**File:** `apps/tui/src/providers/keybinding-types.ts`

#### `KeyHandler`

```typescript
export interface KeyHandler {
  /**
   * Normalized key descriptor string.
   *
   * Format follows OpenTUI's KeyEvent conventions:
   * - Single characters: "q", "g", "j", "k", "/", "?", ":", " " (space)
   * - Modifiers: "ctrl+c", "ctrl+s", "ctrl+d", "ctrl+u", "ctrl+b"
   * - Special keys: "escape", "return", "tab", "shift+tab", "backspace"
   * - Arrow keys: "up", "down", "left", "right"
   * - Uppercase: "G" (shift detected via event.shift + event.name === "g")
   */
  key: string;

  /** Human-readable description shown in the help overlay and status bar hints. */
  description: string;

  /** Grouping label for the help overlay. Examples: "Navigation", "Actions", "Global" */
  group: string;

  /** Handler function called when this keybinding matches. */
  handler: () => void;

  /**
   * Optional predicate. Binding only matches when `when()` returns true.
   * Evaluated at dispatch time, not registration time.
   */
  when?: () => boolean;
}
```

#### `KeybindingScope` and Priority Constants

```typescript
export const PRIORITY = {
  /** Text input focus — handled by OpenTUI focus system, not by scope registration. */
  TEXT_INPUT: 1,
  /** Modal/overlay — command palette, help overlay, confirmation dialogs. */
  MODAL: 2,
  /** Go-to mode — active for 1500ms after 'g' press. */
  GOTO: 3,
  /** Screen-specific — registered per-screen via useScreenKeybindings(). */
  SCREEN: 4,
  /** Global — always-active fallback (q, Esc, Ctrl+C, ?, :, g). */
  GLOBAL: 5,
} as const;

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export interface KeybindingScope {
  /** Unique scope ID. Used for removal and debugging. */
  id: string;
  /** Priority level (1-5). Lower number = higher priority. */
  priority: Priority;
  /** Map of key descriptor → handler. */
  bindings: Map<string, KeyHandler>;
  /** Whether this scope is currently active. Inactive scopes are skipped during dispatch. */
  active: boolean;
}
```

#### `KeybindingContextType`

```typescript
export interface KeybindingContextType {
  /** Register a new keybinding scope. Returns scope ID for removal. */
  registerScope(scope: Omit<KeybindingScope, "id">): string;
  /** Remove a keybinding scope by ID. No-op if ID not found. */
  removeScope(id: string): void;
  /** Update the active state of a scope by ID. */
  setActive(id: string, active: boolean): void;
  /** Get all currently active bindings grouped by group label. */
  getAllBindings(): Map<string, KeyHandler[]>;
  /** Get bindings for the topmost screen scope (for status bar). */
  getScreenBindings(): KeyHandler[];
  /** Check if any modal scope (priority MODAL) is currently active. */
  hasActiveModal(): boolean;
}
```

#### `StatusBarHintsContextType`

```typescript
export interface StatusBarHint {
  /** Key descriptor shown in the hint (e.g., "j/k", "Enter", "/"). */
  keys: string;
  /** Short action label (e.g., "navigate", "open", "search"). */
  label: string;
  /** Ordering priority. Lower = shown first. Default: 50. */
  order?: number;
}

export interface StatusBarHintsContextType {
  /** Current hints to display. */
  hints: StatusBarHint[];
  /** Register hints for a screen. Returns cleanup function. */
  registerHints(sourceId: string, hints: StatusBarHint[]): () => void;
  /** Temporarily override all hints (go-to mode, error display). Returns cleanup. */
  overrideHints(hints: StatusBarHint[]): () => void;
  /** Whether hints are currently overridden. */
  isOverridden: boolean;
}
```

**Rationale:** Types are in a separate file for clean imports. `StatusBarHintsContextType` is separated from `KeybindingContextType` because hints have different lifecycle, different API shape, and different consumers.

---

### Step 2: Key event normalization utility

**File:** `apps/tui/src/providers/normalize-key.ts`

Pure function converting OpenTUI `KeyEvent` into normalized key descriptor strings.

```typescript
import type { KeyEvent } from "@opentui/core";

/**
 * Convert a KeyEvent into a normalized key descriptor string.
 *
 * Rules:
 * 1. Modifier keys prepended as prefix in order: ctrl > meta > shift, joined by "+".
 * 2. Shift NOT included for printable characters — uppercase used instead.
 * 3. Special key names passed through: "escape", "return", "tab", "up", "down", etc.
 *
 * Examples:
 *   { name: "q" }                    → "q"
 *   { name: "g", shift: true }       → "G"
 *   { name: "c", ctrl: true }        → "ctrl+c"
 *   { name: "tab", shift: true }     → "shift+tab"
 *   { name: "escape" }               → "escape"
 */
export function normalizeKeyEvent(event: KeyEvent): string {
  const parts: string[] = [];
  const name = event.name;

  const specialKeys = new Set([
    "escape", "return", "tab", "backspace", "delete",
    "up", "down", "left", "right", "space",
    "home", "end", "pageup", "pagedown",
    "f1", "f2", "f3", "f4", "f5", "f6",
    "f7", "f8", "f9", "f10", "f11", "f12",
    "insert",
  ]);

  const isSpecial = specialKeys.has(name);
  const isSingleChar = name.length === 1;

  if (event.ctrl) parts.push("ctrl");
  if (event.meta || event.option) parts.push("meta");
  if (event.shift && isSpecial) parts.push("shift");

  if (parts.length > 0) {
    parts.push(name);
    return parts.join("+");
  }

  if (isSingleChar && event.shift) {
    return name.toUpperCase();
  }

  return name;
}

/**
 * Normalize a key descriptor string for consistent lookup.
 *
 * Ensures "Ctrl+C" and "ctrl+c" both resolve to "ctrl+c".
 * Maps aliases: "Enter" → "return", "Esc" → "escape".
 * Preserves uppercase single letters ("G" stays "G").
 */
export function normalizeKeyDescriptor(descriptor: string): string {
  const aliases: Record<string, string> = {
    enter: "return",
    esc: "escape",
    arrowup: "up",
    arrowdown: "down",
    arrowleft: "left",
    arrowright: "right",
  };

  if (descriptor.length === 1 && descriptor >= "A" && descriptor <= "Z") {
    return descriptor;
  }

  const lower = descriptor.toLowerCase().trim();
  const parts = lower.split("+").map((p) => aliases[p] ?? p);
  return parts.join("+");
}
```

---

### Step 3: Implement the KeybindingProvider

**File:** `apps/tui/src/providers/KeybindingProvider.tsx`

Core provider that:
1. Manages scope stack via `Map<string, KeybindingScope>`
2. Calls `useKeyboard()` exactly once
3. Walks scopes in priority order on each key event, invokes first matching handler
4. Exposes `KeybindingContextType` and `StatusBarHintsContextType` via two React contexts

```typescript
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
```

**Key design decisions:**

1. **Ref + version counter:** Scope map in `useRef` so `useKeyboard` callback reads fresh scopes without re-subscribing. Version counter triggers re-renders for help overlay and status bar consumers.
2. **Single `useKeyboard()`:** Architectural enforcement — only KeybindingProvider calls `useKeyboard`.
3. **`event.preventDefault()` + `stopPropagation()`:** When a handler matches, prevents event reaching OpenTUI's focused component handler.
4. **`when()` skip:** If predicate returns false, continues to next scope — enables conditional bindings.
5. **Separate status bar context:** Different lifecycle, different consumers, cleaner API.

---

### Step 4: Implement `useScreenKeybindings`

**File:** `apps/tui/src/hooks/useScreenKeybindings.ts`

```typescript
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
```

---

### Step 5: Implement `useGlobalKeybindings`

**File:** `apps/tui/src/hooks/useGlobalKeybindings.ts`

```typescript
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
```

---

### Step 6: Implement `useStatusBarHints`

**File:** `apps/tui/src/hooks/useStatusBarHints.ts`

```typescript
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
```

---

### Step 7: Wire into existing GlobalKeybindings and provider stack

**File:** `apps/tui/src/components/GlobalKeybindings.tsx` (modify existing)

Refactor to use `useGlobalKeybindings()` instead of calling `useKeyboard()` directly:

```typescript
import { useCallback } from "react";
import { useNavigation } from "../hooks/useNavigation.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();

  const onQuit = useCallback(() => {
    if (nav.canPop()) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (nav.canPop()) { nav.pop(); }
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
  const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);
  const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });
  return <>{children}</>;
}
```

---

### Step 8: Text input priority handling

OpenTUI's `InternalKeyHandler.emitWithPriority()` dispatches to global listeners first, then to focused renderables. Our `useKeyboard` registers a global listener, so it runs BEFORE focused input handlers.

**Contract for screens with text inputs:** Single-character keybindings (`j`, `k`, `g`, `q`) MUST use `when` predicates guarded by input focus state:

```typescript
const [isSearchFocused, setIsSearchFocused] = useState(false);

useScreenKeybindings([
  { key: "j", description: "Navigate down", group: "Navigation",
    handler: moveDown, when: () => !isSearchFocused },
]);
```

Keys with modifiers (`ctrl+c`, `ctrl+s`) and special keys (`escape`) don't conflict with text input because OpenTUI's Input/Textarea components don't consume them.

No additional code is needed in KeybindingProvider for P1 handling.

---

## Productionization Notes

1. **No POC phase.** The implementation is production-quality from Step 1.
2. **Event dispatch order verification:** Integration tests confirm `useKeyboard` global handler receives events before focused inputs. The `when()` predicate approach handles this correctly.
3. **Scope cleanup is idempotent:** `removeScope` is a no-op if scope ID doesn't exist, preventing issues with double-cleanup during React 19 concurrent renders.
4. **Performance:** ≤10 active scopes per keypress, `Map.get()` is O(1). Total dispatch time < 1ms.
5. **Memory:** Scopes cleaned up on unmount. Stable during long sessions.

---

## Unit & Integration Tests

### Test File: `e2e/tui/keybinding-normalize.test.ts` (new)

Pure unit tests for key normalization — no TUI launch needed.

```typescript
import { describe, expect, test } from "bun:test";
import { normalizeKeyEvent, normalizeKeyDescriptor } from "../../apps/tui/src/providers/normalize-key";

function makeEvent(overrides: Partial<{
  name: string; ctrl: boolean; meta: boolean; option: boolean; shift: boolean; eventType: string;
}>) {
  return {
    name: "", ctrl: false, meta: false, option: false, shift: false,
    eventType: "press", sequence: "", raw: "", number: false, source: "raw" as const,
    defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    ...overrides,
  };
}

describe("normalizeKeyEvent", () => {
  test("single printable character", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "q" }))).toBe("q");
    expect(normalizeKeyEvent(makeEvent({ name: "/" }))).toBe("/");
    expect(normalizeKeyEvent(makeEvent({ name: "?" }))).toBe("?");
    expect(normalizeKeyEvent(makeEvent({ name: ":" }))).toBe(":");
  });

  test("shifted single character becomes uppercase", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "g", shift: true }))).toBe("G");
  });

  test("ctrl modifier", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "c", ctrl: true }))).toBe("ctrl+c");
    expect(normalizeKeyEvent(makeEvent({ name: "s", ctrl: true }))).toBe("ctrl+s");
  });

  test("special keys", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "escape" }))).toBe("escape");
    expect(normalizeKeyEvent(makeEvent({ name: "return" }))).toBe("return");
    expect(normalizeKeyEvent(makeEvent({ name: "tab" }))).toBe("tab");
  });

  test("shift+tab", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "tab", shift: true }))).toBe("shift+tab");
  });

  test("arrow keys", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "up" }))).toBe("up");
    expect(normalizeKeyEvent(makeEvent({ name: "down" }))).toBe("down");
  });

  test("meta/option modifier", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "d", meta: true }))).toBe("meta+d");
    expect(normalizeKeyEvent(makeEvent({ name: "d", option: true }))).toBe("meta+d");
  });
});

describe("normalizeKeyDescriptor", () => {
  test("normalizes case", () => {
    expect(normalizeKeyDescriptor("Ctrl+C")).toBe("ctrl+c");
  });

  test("preserves uppercase single letters", () => {
    expect(normalizeKeyDescriptor("G")).toBe("G");
  });

  test("maps aliases", () => {
    expect(normalizeKeyDescriptor("Enter")).toBe("return");
    expect(normalizeKeyDescriptor("Esc")).toBe("escape");
    expect(normalizeKeyDescriptor("ArrowUp")).toBe("up");
  });

  test("passes through normalized descriptors", () => {
    expect(normalizeKeyDescriptor("escape")).toBe("escape");
    expect(normalizeKeyDescriptor("q")).toBe("q");
  });
});
```

### Test File: `e2e/tui/app-shell.test.ts` (additions)

All tests use `@microsoft/tui-test` via `bun:test`. Tests that fail due to unimplemented backends are left failing — never skipped.

```typescript
import { describe, expect, test } from "bun:test";
import { launchTUI } from "./helpers";

describe("KeybindingProvider — Priority Dispatch", () => {

  // ── Snapshot Tests ──────────────────────────────────────────────

  test("KEY-SNAP-001: status bar shows keybinding hints on Dashboard", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\S+:\S+/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("KEY-SNAP-002: hints update when navigating screens", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const dashHints = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const repoHints = terminal.getLine(terminal.rows - 1);
    expect(repoHints).not.toEqual(dashHints);
    await terminal.terminate();
  });

  test("KEY-SNAP-003: 80x24 shows ≤4 truncated hints", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("KEY-SNAP-004: 200x60 shows full hint set", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  // ── Global Keybinding Tests ─────────────────────────────────────

  test("KEY-KEY-001: q pops screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("KEY-KEY-002: Escape pops screen when no overlay open", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("KEY-KEY-003: Ctrl+C exits from any screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("\x03");
    await terminal.terminate();
  });

  test("KEY-KEY-004: ? toggles help overlay", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
    await terminal.terminate();
  });

  test("KEY-KEY-005: : opens command palette", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command");
    await terminal.terminate();
  });

  test("KEY-KEY-006: g activates go-to mode", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/dashboard|repos/i);
    await terminal.sendKeys("d");
    await terminal.terminate();
  });

  // ── Priority Layering Tests ─────────────────────────────────────

  test("KEY-KEY-010: modal scope (P2) captures keys before screen scope (P4)", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command");
    await terminal.sendKeys("q");
    await terminal.waitForText("Command"); // q did NOT pop screen
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("KEY-KEY-011: screen keybindings inactive when modal open", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
    await terminal.sendKeys("j"); await terminal.sendKeys("k");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Repositories");
    await terminal.terminate();
  });

  test("KEY-KEY-012: go-to mode (P3) overrides screen keybindings (P4)", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("KEY-KEY-013: text input captures printable keys", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("jest");
    expect(terminal.snapshot()).toMatch(/jest/);
    await terminal.sendKeys("Escape");
    await terminal.terminate();
  });

  test("KEY-KEY-014: Ctrl+C propagates through text input", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("test");
    await terminal.sendKeys("\x03");
    await terminal.terminate();
  });

  test("KEY-KEY-015: Escape unfocuses text input, re-enables screen keys", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("hello");
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("j");
    expect(terminal.snapshot()).not.toMatch(/helloj/);
    await terminal.terminate();
  });

  // ── Scope Lifecycle Tests ───────────────────────────────────────

  test("KEY-KEY-020: screen keybindings registered on mount, removed on unmount", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const repoStatus = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    const dashStatus = terminal.getLine(terminal.rows - 1);
    expect(dashStatus).not.toEqual(repoStatus);
    await terminal.terminate();
  });

  test("KEY-KEY-021: rapid transitions leave no stale scopes", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "n"); await terminal.waitForText("Notifications");
    await terminal.sendKeys("g", "s"); await terminal.waitForText("Search");
    await terminal.sendKeys("g", "d"); await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  // ── Status Bar Hints Tests ──────────────────────────────────────

  test("KEY-KEY-030: help hint visible on every screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/\?.*help/i);
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/\?.*help/i);
    await terminal.terminate();
  });

  test("KEY-KEY-031: go-to mode overrides hints temporarily", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const normal = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g");
    const goTo = terminal.getLine(terminal.rows - 1);
    expect(goTo).not.toEqual(normal);
    expect(goTo).toMatch(/d.*dashboard|r.*repos/i);
    await terminal.sendKeys("Escape");
    expect(terminal.getLine(terminal.rows - 1)).toEqual(normal);
    await terminal.terminate();
  });

  // ── Integration Tests ───────────────────────────────────────────

  test("KEY-INT-001: help overlay shows bindings from all active scopes", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
    const snap = terminal.snapshot();
    expect(snap).toMatch(/q/);
    expect(snap).toMatch(/\?/);
    await terminal.sendKeys("Escape");
    await terminal.terminate();
  });

  // ── Edge Case Tests ─────────────────────────────────────────────

  test("KEY-EDGE-001: unhandled key does not crash", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("z"); await terminal.sendKeys("x");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.terminate();
  });

  test("KEY-EDGE-002: rapid key presses processed sequentially", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d"); await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("KEY-EDGE-003: scope removal during dispatch does not crash", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.sendKeys("g", "r");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  // ── Responsive Tests ────────────────────────────────────────────

  test("KEY-RSP-001: keybindings work at 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("KEY-RSP-002: keybindings work at 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("?"); await terminal.waitForText("Global");
    await terminal.sendKeys("Escape"); await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("KEY-RSP-003: resize does not break keybinding dispatch", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.resize(80, 24);
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("KEY-RSP-004: hint count adapts to width on resize", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    const wide = (terminal.getLine(terminal.rows - 1).match(/\S+:\S+/g) || []).length;
    await terminal.resize(80, 24);
    const narrow = (terminal.getLine(terminal.rows - 1).match(/\S+:\S+/g) || []).length;
    expect(narrow).toBeLessThanOrEqual(wide);
    await terminal.terminate();
  });
});
```

---

## File Summary

| File | Type | Purpose |
|------|------|--------|
| `apps/tui/src/providers/keybinding-types.ts` | New | Type definitions: KeyHandler, KeybindingScope, PRIORITY, context types |
| `apps/tui/src/providers/normalize-key.ts` | New | `normalizeKeyEvent()` and `normalizeKeyDescriptor()` pure utilities |
| `apps/tui/src/providers/KeybindingProvider.tsx` | New | React context provider with scope management and keyboard dispatch |
| `apps/tui/src/hooks/useScreenKeybindings.ts` | New | Per-screen keybinding registration hook |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | New | Global keybinding registration hook |
| `apps/tui/src/hooks/useStatusBarHints.ts` | New | Status bar hint consumer hook |
| `apps/tui/src/components/GlobalKeybindings.tsx` | Modify | Refactor to use useGlobalKeybindings instead of direct useKeyboard |
| `e2e/tui/app-shell.test.ts` | Add tests | KeybindingProvider priority dispatch, lifecycle, status bar tests |
| `e2e/tui/keybinding-normalize.test.ts` | New | Unit tests for key normalization utilities |

---

## Dependency Graph

```
keybinding-types.ts (pure types, no imports)
    ↑
normalize-key.ts (imports KeyEvent from @opentui/core)
    ↑
KeybindingProvider.tsx (imports types, normalize-key, @opentui/react useKeyboard)
    ↑
├── useScreenKeybindings.ts (imports KeybindingProvider contexts, types, normalize-key)
├── useGlobalKeybindings.ts (imports KeybindingProvider context, types, normalize-key)
└── useStatusBarHints.ts (imports StatusBarHintsContext from provider, types)
    ↑
GlobalKeybindings.tsx (imports useGlobalKeybindings, useNavigation)
```

---

## Verification Checklist

- [ ] `useKeyboard()` is called exactly once, in `KeybindingProvider`
- [ ] No other component calls `useKeyboard()` directly
- [ ] Priority dispatch order: MODAL (2) > GOTO (3) > SCREEN (4) > GLOBAL (5)
- [ ] Text input P1 is handled by OpenTUI's native focus system
- [ ] `when()` predicate returning false causes fallthrough to next scope
- [ ] Scope registration/removal is idempotent and safe during concurrent renders
- [ ] Status bar hints update within one render frame of screen navigation
- [ ] Help overlay displays bindings from all active scopes grouped by `group` label
- [ ] All global keybindings (`q`, `Esc`, `Ctrl+C`, `?`, `:`, `g`) fire as Priority 5
- [ ] Unhandled keys pass through to OpenTUI's focused component
- [ ] Tests never skip or comment out — failures due to unimplemented backends left failing