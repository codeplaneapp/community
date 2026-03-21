# Engineering Specification: `tui-global-keybindings`

## Implement global keybinding system with scope management and KeybindingProvider

---

## Overview

This ticket delivers the keybinding infrastructure consumed by every TUI screen. It includes the `KeybindingProvider` (scope management and priority-based dispatch), key normalization utilities, global keybinding registration, screen-level keybinding hooks, and status bar hint management. The system acts as the single keyboard input funnel — OpenTUI's `useKeyboard` is called exactly once at the provider level, and all keybinding resolution flows through the scope priority stack.

### Dependencies

- **`tui-bootstrap-and-renderer`** — `createCliRenderer()` and `createRoot()` must exist so the provider stack can mount.
- **`tui-navigation-provider`** — `NavigationProvider` and `useNavigation()` must be available for `q`/`Esc`/go-to handlers to call `pop()`, `reset()`, etc.

### Deliverables

| File | Purpose |
|------|---------|
| `apps/tui/src/providers/keybinding-types.ts` | Type definitions, priority constants, context interfaces |
| `apps/tui/src/providers/normalize-key.ts` | Key event → descriptor normalization, descriptor alias resolution |
| `apps/tui/src/providers/KeybindingProvider.tsx` | React provider: scope registry, priority dispatch, status bar hints |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | Hook: registers always-active global keybindings (?, :, q, Esc, Ctrl+C, g) |
| `apps/tui/src/hooks/useScreenKeybindings.ts` | Hook: registers per-screen keybindings with auto-cleanup |
| `apps/tui/src/hooks/useStatusBarHints.ts` | Hook: reads current status bar hints for the StatusBar component |
| `apps/tui/src/hooks/useKeybindings.ts` | Re-export barrel for consumer convenience |
| `apps/tui/src/navigation/goToBindings.ts` | Go-to mode binding table and executor |
| `apps/tui/src/components/GlobalKeybindings.tsx` | Wrapper component that wires global actions to navigation/overlay systems |
| `e2e/tui/app-shell.test.ts` | E2E tests for keybinding dispatch, priority, hints, and edge cases |
| `e2e/tui/keybinding-normalize.test.ts` | Unit-style tests for key normalization functions |

---

## Implementation Plan

### Step 1: Key normalization utilities

**File:** `apps/tui/src/providers/normalize-key.ts`

This module converts raw OpenTUI `KeyEvent` objects into normalized string descriptors and normalizes user-specified descriptor strings for consistent Map lookups.

#### `normalizeKeyEvent(event: KeyEvent): string`

Rules:
1. If `event.eventType === "release"`, the caller should skip before calling (handled at provider level).
2. Modifiers are prepended as a prefix in canonical order: `ctrl` > `meta` > `shift`, joined by `+`.
3. `shift` is **NOT** included for single printable characters — uppercase is used instead (e.g., `{name: "g", shift: true}` → `"G"`).
4. `shift` **IS** included for special keys (e.g., `{name: "tab", shift: true}` → `"shift+tab"`).
5. Special keys pass through by name: `escape`, `return`, `tab`, `backspace`, `delete`, `up`, `down`, `left`, `right`, `space`, `home`, `end`, `pageup`, `pagedown`, `f1`–`f12`, `insert`.
6. `event.meta` and `event.option` both map to the `meta` prefix (macOS Option = Meta).

Special key set is defined as a `Set` for O(1) membership checks.

#### `normalizeKeyDescriptor(descriptor: string): string`

Normalizes user-authored descriptor strings for consistent lookup:
- Case-insensitive: `"Ctrl+C"` → `"ctrl+c"`
- Alias mapping: `"Enter"` → `"return"`, `"Esc"` → `"escape"`, `"ArrowUp"` → `"up"`, etc.
- Preserves uppercase single letters: `"G"` stays `"G"`.
- Splits on `+`, lowercases each part, applies aliases, re-joins.

```typescript
import type { KeyEvent } from "@opentui/core";

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

export function normalizeKeyDescriptor(descriptor: string): string {
  const aliases: Record<string, string> = {
    enter: "return",
    esc: "escape",
    arrowup: "up",
    arrowdown: "down",
    arrowleft: "left",
    arrowright: "right",
  };

  // Preserve uppercase single letters (G, R, etc.)
  if (descriptor.length === 1 && descriptor >= "A" && descriptor <= "Z") {
    return descriptor;
  }

  const lower = descriptor.toLowerCase().trim();
  const parts = lower.split("+").map((p) => aliases[p] ?? p);
  return parts.join("+");
}
```

### Step 2: Type definitions and priority constants

**File:** `apps/tui/src/providers/keybinding-types.ts`

This file defines all TypeScript interfaces and constants for the keybinding system. It is separated from the provider to allow imports without circular dependencies.

#### Priority levels

```typescript
export const PRIORITY = {
  TEXT_INPUT: 1,  // Handled by OpenTUI focus system, not scope registration
  MODAL: 2,       // Command palette, help overlay, confirmation dialogs
  GOTO: 3,        // Go-to mode (active for 1500ms after 'g' press)
  SCREEN: 4,      // Per-screen keybindings (registered via useScreenKeybindings)
  GLOBAL: 5,      // Always-active fallback (q, Esc, Ctrl+C, ?, :, g)
} as const;

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];
```

Lower number = higher priority. The dispatch loop iterates active scopes sorted by priority ascending; the first match wins.

#### Key interfaces

```typescript
export interface KeyHandler {
  key: string;            // Normalized key descriptor
  description: string;    // Shown in help overlay and status bar
  group: string;          // Grouping label for help overlay
  handler: () => void;    // Called when keybinding matches
  when?: () => boolean;   // Optional conditional activation
}

export interface KeybindingScope {
  id: string;
  priority: Priority;
  bindings: Map<string, KeyHandler>;
  active: boolean;
}

export interface KeybindingContextType {
  registerScope(scope: Omit<KeybindingScope, "id">): string;
  removeScope(id: string): void;
  setActive(id: string, active: boolean): void;
  getAllBindings(): Map<string, KeyHandler[]>;
  getScreenBindings(): KeyHandler[];
  hasActiveModal(): boolean;
}

export interface StatusBarHint {
  keys: string;       // Display text: "j/k", "Enter", "/"
  label: string;      // Action text: "navigate", "open", "search"
  order?: number;     // Sort priority (lower = first). Default: 50
}

export interface StatusBarHintsContextType {
  hints: StatusBarHint[];
  registerHints(sourceId: string, hints: StatusBarHint[]): () => void;
  overrideHints(hints: StatusBarHint[]): () => void;
  isOverridden: boolean;
}
```

### Step 3: KeybindingProvider

**File:** `apps/tui/src/providers/KeybindingProvider.tsx`

The central provider that owns the single `useKeyboard()` call and manages all keybinding scopes.

#### Architecture decisions

1. **Single `useKeyboard()` call.** OpenTUI's `useKeyboard` is called exactly once in the entire component tree, here in `KeybindingProvider`. All keyboard input flows through this single funnel. No other component should call `useKeyboard()` directly for keybinding purposes.

2. **Ref + version counter pattern.** Scopes are stored in a `useRef<Map<string, KeybindingScope>>` for stable dispatch (no stale closures). A `useState` counter is bumped on scope mutations to trigger re-renders for consumers that read binding metadata (help overlay, status bar).

3. **Scope ordering.** Active scopes are sorted by:
   - Priority ascending (lower number = higher priority)
   - LIFO within same priority (newer scope wins if two scopes have the same priority)

4. **Input suppression (Priority 1 — TEXT_INPUT).** Text input suppression is handled at OpenTUI's focus system level, not by explicit scope registration. When an `<input>` or `<textarea>` has focus, OpenTUI's focus system captures printable keys. Only `Ctrl+*`, `Esc`, and `Enter` propagate through to the keybinding system. This is a constraint of the renderer, not something we implement.

5. **Dispatch flow:**
   ```
   KeyEvent arrives via useKeyboard()
     → Skip if eventType === "release"
     → normalizeKeyEvent(event) → descriptor string
     → Iterate active scopes sorted by priority ASC, LIFO within priority
       → For each scope: look up descriptor in scope.bindings Map
         → If found and handler.when() returns true (or when is undefined):
           → Call handler.handler()
           → event.preventDefault() + event.stopPropagation()
           → Return (first match wins)
         → If found but when() returns false: skip, continue to next scope
     → No match: event falls through to OpenTUI's focused component
   ```

6. **Status bar hints** are co-located in this provider via a second context (`StatusBarHintsContext`) to avoid an additional provider in the tree. Hints have two modes:
   - **Normal:** Hints registered by screens via `registerHints()`, merged and sorted by `order`.
   - **Override:** Temporary override (used by go-to mode, error states) that replaces all hints. Returns a cleanup function.

#### Key implementation details

```typescript
export const KeybindingContext = createContext<KeybindingContextType | null>(null);
export const StatusBarHintsContext = createContext<StatusBarHintsContextType | null>(null);

export function KeybindingProvider({ children }: { children: ReactNode }) {
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

  useKeyboard((event: KeyEvent) => {
    if (event.eventType === "release") return;

    const descriptor = normalizeKeyEvent(event);
    const scopes = getActiveScopesSorted();

    for (const scope of scopes) {
      const handler = scope.bindings.get(descriptor);
      if (handler) {
        if (handler.when && !handler.when()) continue;
        handler.handler();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
  });

  // ... (getAllBindings, getScreenBindings, hasActiveModal, status bar hint state)
}
```

#### `getAllBindings()` — used by the help overlay

Returns a `Map<string, KeyHandler[]>` where the key is the group label. Iterates all active scopes in priority order, deduplicating by key descriptor (first registration wins — higher-priority binding shadows lower-priority).

#### `getScreenBindings()` — used by the status bar

Returns `KeyHandler[]` from the most recently registered `PRIORITY.SCREEN` scope. Used by the `StatusBar` component to show context-sensitive keybinding hints.

#### `hasActiveModal()` — used by overlay logic

Returns `true` if any scope with `priority === PRIORITY.MODAL` is currently active. Used by the `OverlayLayer` to determine if a modal is open.

### Step 4: Global keybindings hook

**File:** `apps/tui/src/hooks/useGlobalKeybindings.ts`

Registers the always-active keybindings at `PRIORITY.GLOBAL` (5). Called once by `<GlobalKeybindings>`. Accepts handler callbacks as props to decouple the hook from navigation/overlay implementation details.

```typescript
export interface GlobalKeybindingActions {
  onQuit: () => void;           // q — pop screen or exit on root
  onEscape: () => void;         // Esc — close overlay, or pop, or noop
  onForceQuit: () => void;      // Ctrl+C — immediate exit
  onHelp: () => void;           // ? — toggle help overlay
  onCommandPalette: () => void; // : — open command palette
  onGoTo: () => void;           // g — enter go-to mode
}

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
    const scopeId = ctx.registerScope({
      priority: PRIORITY.GLOBAL,
      bindings: bindingsMap,
      active: true,
    });
    return () => { ctx.removeScope(scopeId); };
  }, [ctx, bindingsMap]);
}
```

### Step 5: Screen keybindings hook

**File:** `apps/tui/src/hooks/useScreenKeybindings.ts`

The primary consumer hook for screen components. Pushes a `PRIORITY.SCREEN` scope on mount, pops on unmount. Also registers status bar hints.

#### Binding registration

```typescript
export function useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[]): void
```

- Accepts an array of `KeyHandler` objects.
- Normalizes all key descriptors via `normalizeKeyDescriptor()` for consistent lookup.
- Uses a ref pattern to keep handler functions fresh without re-registering the scope on every render. The `bindingsMap` only recreates when the set of key descriptors changes (checked by joining keys into a string).
- Automatically generates status bar hints from the first 8 bindings if no custom `hints` array is provided.

#### Auto-cleanup

The `useEffect` cleanup function calls `ctx.removeScope(scopeId)`, ensuring no stale scopes remain after screen unmount. This is critical for:
- Rapid screen transitions (go-to → go-to → go-to)
- React strict mode double-mount/unmount in development
- Back-navigation where the previous screen remounts

### Step 6: Status bar hints hook

**File:** `apps/tui/src/hooks/useStatusBarHints.ts`

A thin consumer hook for the `StatusBar` component.

```typescript
export function useStatusBarHints(): StatusBarHintsContextType {
  const ctx = useContext(StatusBarHintsContext);
  if (!ctx) throw new Error("useStatusBarHints must be used within a KeybindingProvider");
  return ctx;
}
```

Returns `{ hints, registerHints, overrideHints, isOverridden }`. The `StatusBar` component reads `hints` to render the left section of the status bar.

### Step 7: Consumer barrel export

**File:** `apps/tui/src/hooks/useKeybindings.ts`

Re-exports all keybinding-related hooks for convenient single-import:

```typescript
export { useScreenKeybindings } from "./useScreenKeybindings.js";
export { useGlobalKeybindings, type GlobalKeybindingActions } from "./useGlobalKeybindings.js";
export { useStatusBarHints, type StatusBarHint, type StatusBarHintsContextType } from "./useStatusBarHints.js";
export { PRIORITY, type KeyHandler, type KeybindingScope, type KeybindingContextType } from "../providers/keybinding-types.js";
```

### Step 8: Go-to mode bindings

**File:** `apps/tui/src/navigation/goToBindings.ts`

Defines the go-to mode binding table and the `executeGoTo()` function.

#### Binding table

| Key after `g` | Destination | Requires Repo |
|---------------|-------------|---------------|
| `d` | Dashboard | No |
| `r` | RepoList | No |
| `i` | Issues | Yes |
| `l` | Landings | Yes |
| `w` | Workspaces | No |
| `n` | Notifications | No |
| `s` | Search | No |
| `o` | Organizations | No |
| `f` | Workflows | Yes |
| `k` | Wiki | Yes |
| `a` | Agents | Yes |

#### `executeGoTo(nav, binding, repoContext)`

Builds the navigation stack:
1. `nav.reset(ScreenName.Dashboard)` — clear stack, push Dashboard as root
2. If `repoContext` exists, push `RepoOverview` with owner/repo params
3. Push the target screen with owner/repo params if applicable
4. Returns `{ error?: string }` — error string if `requiresRepo` is true but no repo context exists

#### Go-to mode lifecycle (in GlobalKeybindings component)

Go-to mode is a transient state managed by the `GlobalKeybindings` component:

1. User presses `g` → `onGoTo` callback fires
2. `GlobalKeybindings` registers a temporary `PRIORITY.GOTO` scope with all go-to bindings
3. Status bar hints are overridden with go-to destinations: `d:dashboard  r:repos  i:issues ...`
4. A 1500ms timeout starts. On timeout: remove GOTO scope, restore hints
5. If user presses a valid second key (e.g., `d`): execute navigation, remove GOTO scope, restore hints
6. If user presses an invalid key or `Esc`: cancel go-to mode, remove GOTO scope, restore hints

### Step 9: GlobalKeybindings wrapper component

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

A React component that sits inside the provider stack and wires `useGlobalKeybindings()` to the navigation system and overlay state.

```typescript
export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const [goToMode, setGoToMode] = useState(false);
  const goToTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToScopeId = useRef<string | null>(null);
  const keybindingCtx = useContext(KeybindingContext);
  const statusBarCtx = useContext(StatusBarHintsContext);

  const cleanupGoTo = useCallback(() => {
    setGoToMode(false);
    if (goToTimeout.current) { clearTimeout(goToTimeout.current); goToTimeout.current = null; }
    if (goToScopeId.current && keybindingCtx) {
      keybindingCtx.removeScope(goToScopeId.current);
      goToScopeId.current = null;
    }
    // statusBarCtx override cleanup handled by stored cleanup ref
  }, [keybindingCtx]);

  const onGoTo = useCallback(() => {
    if (goToMode) return; // Already in go-to mode

    // Register GOTO scope with all go-to bindings
    const goToMap = new Map<string, KeyHandler>();
    for (const binding of goToBindings) {
      goToMap.set(binding.key, {
        key: binding.key,
        description: binding.description,
        group: "Go to",
        handler: () => {
          const result = executeGoTo(nav, binding, nav.repoContext);
          if (result.error) {
            // Show error in status bar briefly
          }
          cleanupGoTo();
        },
      });
    }
    // Also bind Esc to cancel go-to mode
    goToMap.set("escape", {
      key: "escape", description: "Cancel go-to", group: "Go to",
      handler: cleanupGoTo,
    });

    goToScopeId.current = keybindingCtx!.registerScope({
      priority: PRIORITY.GOTO,
      bindings: goToMap,
      active: true,
    });

    // Override status bar hints
    const goToHints: StatusBarHint[] = goToBindings.map((b, i) => ({
      keys: b.key, label: b.description.toLowerCase(), order: i,
    }));
    statusBarCtx?.overrideHints(goToHints);

    setGoToMode(true);

    // 1500ms timeout to auto-cancel
    goToTimeout.current = setTimeout(cleanupGoTo, 1500);
  }, [goToMode, nav, keybindingCtx, statusBarCtx, cleanupGoTo]);

  const onQuit = useCallback(() => {
    if (nav.canGoBack) nav.pop();
    else process.exit(0);
  }, [nav]);

  const onEscape = useCallback(() => {
    // If overlay is open, close it (handled by overlay's own MODAL scope)
    // If no overlay, same as q
    if (nav.canGoBack) nav.pop();
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
  const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });

  // Cleanup on unmount
  useEffect(() => () => cleanupGoTo(), [cleanupGoTo]);

  return <>{children}</>;
}
```

**Note on `onHelp` and `onCommandPalette`:** These are stubbed with TODO comments because the help overlay and command palette are separate tickets. The handlers will be wired when those tickets are implemented. The keybinding registration (? and :) is active immediately — pressing these keys will simply no-op until the overlay/palette components exist.

### Step 10: Provider stack integration

**File:** `apps/tui/src/index.tsx` (modification)

`KeybindingProvider` wraps `GlobalKeybindings` and all content beneath it in the provider stack:

```
ErrorBoundary
  → ThemeProvider
    → KeybindingProvider          ← THIS TICKET
      → AuthProvider
        → APIClientProvider
          → SSEProvider
            → NavigationProvider
              → LoadingProvider
                → GlobalKeybindings  ← THIS TICKET
                  → AppShell
```

**Why KeybindingProvider is above NavigationProvider:** `KeybindingProvider` needs to be initialized before any component that might register keybindings. Since `NavigationProvider`'s screen components register screen-level keybindings, the provider must be an ancestor.

**Why GlobalKeybindings is below NavigationProvider:** `GlobalKeybindings` calls `useNavigation()` for `pop()`/`reset()`. It must be a descendant of `NavigationProvider`.

---

## Keybinding Registration API

### Registration shape

```typescript
{
  key: string,              // Normalized descriptor: "q", "ctrl+c", "G", "escape"
  scope: 'global' | 'screen' | 'overlay',  // Maps to PRIORITY.GLOBAL/SCREEN/MODAL
  handler: () => void,      // Action to execute
  description: string,      // Human-readable (for help overlay and status bar)
  when?: () => boolean      // Optional conditional (evaluated at dispatch time)
}
```

Note: The `scope` field in the ticket description maps to `priority` in the implementation:
- `'global'` → `PRIORITY.GLOBAL` (5)
- `'screen'` → `PRIORITY.SCREEN` (4)
- `'overlay'` → `PRIORITY.MODAL` (2)

The `group` field (added in implementation) groups bindings in the help overlay by category ("Global", "Navigation", "Actions", etc.).

### Scope priority resolution

```
overlay (MODAL=2) > goto (GOTO=3) > screen (SCREEN=4) > global (GLOBAL=5)
```

Text input (PRIORITY.TEXT_INPUT=1) is handled by OpenTUI's focus system, not by explicit scope registration. When an `<input>` element has focus:
- All printable single-character keys are captured by the input
- Only `Ctrl+*`, `Esc`, `Enter`, `Tab`, and `Shift+Tab` propagate through to the keybinding system
- This behavior is enforced by OpenTUI's renderer, not by the KeybindingProvider

### `useKeybindings()` consumer hook

Screen components use `useScreenKeybindings()` as the primary consumer API:

```typescript
// In a screen component
function IssueListScreen() {
  useScreenKeybindings(
    [
      { key: "j", description: "Navigate down", group: "Navigation", handler: moveDown },
      { key: "k", description: "Navigate up",   group: "Navigation", handler: moveUp },
      { key: "Enter", description: "Open issue", group: "Actions",   handler: openIssue },
      { key: "/", description: "Search",         group: "Actions",   handler: focusSearch },
      { key: "c", description: "Create issue",   group: "Actions",   handler: createIssue },
    ],
    [
      { keys: "j/k",   label: "navigate", order: 0 },
      { keys: "Enter", label: "open",     order: 10 },
      { keys: "/",     label: "search",   order: 20 },
      { keys: "c",     label: "create",   order: 30 },
    ]
  );

  // ... screen rendering
}
```

---

## Unit & Integration Tests

### Test file: `e2e/tui/keybinding-normalize.test.ts`

Pure unit tests for key normalization functions. These run without launching the TUI.

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

  test("special keys pass through", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "escape" }))).toBe("escape");
    expect(normalizeKeyEvent(makeEvent({ name: "return" }))).toBe("return");
    expect(normalizeKeyEvent(makeEvent({ name: "tab" }))).toBe("tab");
  });

  test("shift+tab for special keys", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "tab", shift: true }))).toBe("shift+tab");
  });

  test("arrow keys", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "up" }))).toBe("up");
    expect(normalizeKeyEvent(makeEvent({ name: "down" }))).toBe("down");
  });

  test("meta/option modifier maps to meta", () => {
    expect(normalizeKeyEvent(makeEvent({ name: "d", meta: true }))).toBe("meta+d");
    expect(normalizeKeyEvent(makeEvent({ name: "d", option: true }))).toBe("meta+d");
  });

  test("release events are distinguished by eventType", () => {
    // Caller is responsible for filtering release events
    const releaseEvent = makeEvent({ name: "q", eventType: "release" });
    expect(normalizeKeyEvent(releaseEvent)).toBe("q");
  });
});

describe("normalizeKeyDescriptor", () => {
  test("normalizes case", () => {
    expect(normalizeKeyDescriptor("Ctrl+C")).toBe("ctrl+c");
  });

  test("preserves uppercase single letters", () => {
    expect(normalizeKeyDescriptor("G")).toBe("G");
    expect(normalizeKeyDescriptor("R")).toBe("R");
  });

  test("maps aliases", () => {
    expect(normalizeKeyDescriptor("Enter")).toBe("return");
    expect(normalizeKeyDescriptor("Esc")).toBe("escape");
    expect(normalizeKeyDescriptor("ArrowUp")).toBe("up");
    expect(normalizeKeyDescriptor("ArrowDown")).toBe("down");
  });

  test("passes through normalized descriptors", () => {
    expect(normalizeKeyDescriptor("escape")).toBe("escape");
    expect(normalizeKeyDescriptor("q")).toBe("q");
  });
});
```

### Test file: `e2e/tui/app-shell.test.ts`

E2E tests using `@microsoft/tui-test` that verify the full keybinding system in a running TUI process.

#### Test organization and naming convention

Tests are prefixed with a category code:
- `KEY-SNAP-*` — Snapshot tests for visual output
- `KEY-KEY-*` — Keyboard interaction tests
- `KEY-RSP-*` — Responsive behavior tests
- `KEY-INT-*` — Integration tests (keybindings + other systems)
- `KEY-EDGE-*` — Edge case tests

#### Snapshot tests

```typescript
describe("KeybindingProvider — Priority Dispatch", () => {
  let terminal: TUITestInstance;
  afterEach(async () => { if (terminal) await terminal.terminate(); });

  test("KEY-SNAP-001: status bar shows keybinding hints on Dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\S+:\S+/);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("KEY-SNAP-002: hints update when navigating screens", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const dashHints = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const repoHints = terminal.getLine(terminal.rows - 1);
    expect(repoHints).not.toEqual(dashHints);
  });

  test("KEY-SNAP-003: 80x24 shows ≤4 truncated hints", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("KEY-SNAP-004: 200x60 shows full hint set", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

#### Global keybinding tests

```typescript
  test("KEY-KEY-001: q pops screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-KEY-002: Escape pops screen when no overlay open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-KEY-003: Ctrl+C exits from any screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("\x03");
    // Process should have exited
  });

  test("KEY-KEY-004: ? toggles help overlay", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
  });

  test("KEY-KEY-005: : opens command palette", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command");
  });

  test("KEY-KEY-006: g activates go-to mode", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/dashboard|repos/i);
    await terminal.sendKeys("d");
  });
```

#### Priority layering tests

```typescript
  test("KEY-KEY-010: modal scope (P2) captures keys before screen scope (P4)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":");
    await terminal.waitForText("Command");
    await terminal.sendKeys("q");           // Should NOT pop screen
    await terminal.waitForText("Command"); // Modal still open
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-KEY-011: screen keybindings inactive when modal open", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
    await terminal.sendKeys("j"); // Should NOT move list cursor
    await terminal.sendKeys("k");
    await terminal.sendKeys("Escape");
    await terminal.waitForText("Repositories");
  });

  test("KEY-KEY-012: go-to mode (P3) overrides screen keybindings (P4)", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-KEY-013: text input captures printable keys", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("jest");
    expect(terminal.snapshot()).toMatch(/jest/);
    await terminal.sendKeys("Escape");
  });

  test("KEY-KEY-014: Ctrl+C propagates through text input", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("test");
    await terminal.sendKeys("\x03"); // Should exit
  });

  test("KEY-KEY-015: Escape unfocuses text input, re-enables screen keys", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "search"] });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/");
    await terminal.sendText("hello");
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("j"); // Should be treated as keybinding, not text
    expect(terminal.snapshot()).not.toMatch(/helloj/);
  });
```

#### Scope lifecycle tests

```typescript
  test("KEY-KEY-020: screen keybindings registered on mount, removed on unmount", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const repoStatus = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    const dashStatus = terminal.getLine(terminal.rows - 1);
    expect(dashStatus).not.toEqual(repoStatus);
  });

  test("KEY-KEY-021: rapid transitions leave no stale scopes", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "n"); await terminal.waitForText("Notifications");
    await terminal.sendKeys("g", "s"); await terminal.waitForText("Search");
    await terminal.sendKeys("g", "d"); await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
  });
```

#### Status bar hints tests

```typescript
  test("KEY-KEY-030: help hint visible on every screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/\?.*help/i);
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/\?.*help/i);
  });

  test("KEY-KEY-031: go-to mode overrides hints temporarily", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const normal = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g");
    const goTo = terminal.getLine(terminal.rows - 1);
    expect(goTo).not.toEqual(normal);
    expect(goTo).toMatch(/d.*dashboard|r.*repos/i);
    await terminal.sendKeys("Escape");
    expect(terminal.getLine(terminal.rows - 1)).toEqual(normal);
  });
```

#### Integration tests

```typescript
  test("KEY-INT-001: help overlay shows bindings from all active scopes", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("?");
    await terminal.waitForText("Global");
    const snap = terminal.snapshot();
    expect(snap).toMatch(/q/);  // Global binding visible
    expect(snap).toMatch(/\?/); // Help binding visible
    await terminal.sendKeys("Escape");
  });
```

#### Edge case tests

```typescript
  test("KEY-EDGE-001: unhandled key does not crash", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("z"); await terminal.sendKeys("x");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("KEY-EDGE-002: rapid key presses processed sequentially", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d"); await terminal.waitForText("Dashboard");
  });

  test("KEY-EDGE-003: scope removal during dispatch does not crash", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.sendKeys("g", "r");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
  });
```

#### Responsive tests

```typescript
  test("KEY-RSP-001: keybindings work at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
  });

  test("KEY-RSP-002: keybindings work at 200x60", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("?"); await terminal.waitForText("Global");
    await terminal.sendKeys("Escape"); await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("KEY-RSP-003: resize does not break keybinding dispatch", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.resize(80, 24);
    await terminal.sendKeys("q"); await terminal.waitForText("Dashboard");
  });

  test("KEY-RSP-004: hint count adapts to width on resize", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    const wide = (terminal.getLine(terminal.rows - 1).match(/\S+:\S+/g) || []).length;
    await terminal.resize(80, 24);
    const narrow = (terminal.getLine(terminal.rows - 1).match(/\S+:\S+/g) || []).length;
    expect(narrow).toBeLessThanOrEqual(wide);
  });
```

### Tests that will fail (and should remain failing)

- **KEY-KEY-004** (`? toggles help overlay`) — Will fail until the help overlay ticket is implemented. The `?` keybinding is registered but the handler is a no-op stub.
- **KEY-KEY-005** (`: opens command palette`) — Will fail until the command palette ticket is implemented. Same stub pattern.
- **KEY-KEY-010** (modal scope priority) — Will fail until the command palette renders a modal overlay.
- **KEY-KEY-011** (screen keys inactive with modal) — Same dependency on help overlay.
- **KEY-INT-001** (help overlay shows bindings) — Depends on help overlay.

Per project policy, these tests are **never skipped or commented out**. They serve as a clear signal of what remains to be implemented.

---

## Productionization Plan

The reference implementation exists in `specs/tui/apps/tui/src/`. To productionize:

### 1. Direct port from specs → apps

The following files are ported verbatim from `specs/tui/apps/tui/src/` to `apps/tui/src/`:

| Source (specs/) | Destination (apps/) | Modifications |
|----------------|--------------------|--------------|
| `providers/keybinding-types.ts` | `providers/keybinding-types.ts` | None — use as-is |
| `providers/normalize-key.ts` | `providers/normalize-key.ts` | None — use as-is |
| `providers/KeybindingProvider.tsx` | `providers/KeybindingProvider.tsx` | None — use as-is |
| `hooks/useGlobalKeybindings.ts` | `hooks/useGlobalKeybindings.ts` | None — use as-is |
| `hooks/useScreenKeybindings.ts` | `hooks/useScreenKeybindings.ts` | None — use as-is |
| `hooks/useStatusBarHints.ts` | `hooks/useStatusBarHints.ts` | None — use as-is |
| `navigation/goToBindings.ts` | `navigation/goToBindings.ts` | Verify ScreenName import path resolves |
| `components/GlobalKeybindings.tsx` | `components/GlobalKeybindings.tsx` | None — use as-is |

### 2. Import path verification

All files use `.js` extensions in import specifiers (ESM convention with TypeScript). Verify these resolve correctly in the `apps/tui/` build environment:
- `@opentui/core` → must be installed and resolvable
- `@opentui/react` → must be installed and resolvable
- Relative imports (`../providers/KeybindingProvider.js`) → verify directory structure matches

### 3. Integration with existing code

The `apps/tui/src/` directory currently has minimal files (Agents screen stubs, diff syntax utilities). The keybinding system has no conflicts with existing code. Ensure:
- `apps/tui/src/index.tsx` is updated to include `KeybindingProvider` and `GlobalKeybindings` in the provider stack
- `apps/tui/package.json` includes `react`, `@opentui/core`, and `@opentui/react` as dependencies

### 4. Test migration

Port test files from `specs/tui/e2e/tui/` to `e2e/tui/`:
- `keybinding-normalize.test.ts` — port verbatim, update import paths if necessary
- `app-shell.test.ts` — merge the `KeybindingProvider — Priority Dispatch` describe block into the existing file (the file may already contain `TUI_LOADING_STATES` tests from another ticket)

### 5. Build verification

```bash
# Verify TypeScript compiles
bun run tsc --noEmit -p apps/tui/tsconfig.json

# Verify normalize-key unit tests pass
bun test e2e/tui/keybinding-normalize.test.ts

# Verify TUI launches and exits cleanly
bun run apps/tui/src/index.tsx & sleep 2 && kill %1
```

### 6. Pre-merge checklist

- [ ] All files in `apps/tui/src/` compile without errors
- [ ] `normalizeKeyEvent` and `normalizeKeyDescriptor` unit tests pass
- [ ] TUI launches without crash (Ctrl+C exits cleanly)
- [ ] `q` on root screen exits the TUI
- [ ] `g` + `d` navigates to Dashboard (or stays on Dashboard if already there)
- [ ] Status bar shows at least one keybinding hint
- [ ] No console errors or unhandled promise rejections during normal operation
- [ ] E2E tests that depend on unimplemented features (help overlay, command palette) fail gracefully with clear error messages, not crashes

---

## File Inventory

### New files (production)

| Path | Lines (est.) | Purpose |
|------|-------------|----------|
| `apps/tui/src/providers/keybinding-types.ts` | ~90 | Types, interfaces, priority constants |
| `apps/tui/src/providers/normalize-key.ts` | ~75 | Key event normalization |
| `apps/tui/src/providers/KeybindingProvider.tsx` | ~165 | Provider: scope registry, dispatch, hints |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | ~42 | Global keybinding registration |
| `apps/tui/src/hooks/useScreenKeybindings.ts` | ~57 | Screen-level keybinding registration |
| `apps/tui/src/hooks/useStatusBarHints.ts` | ~13 | Status bar hint consumer |
| `apps/tui/src/hooks/useKeybindings.ts` | ~8 | Re-export barrel |
| `apps/tui/src/navigation/goToBindings.ts` | ~58 | Go-to mode binding table |
| `apps/tui/src/components/GlobalKeybindings.tsx` | ~95 | Global keybinding wiring component |

### New files (test)

| Path | Lines (est.) | Purpose |
|------|-------------|----------|
| `e2e/tui/keybinding-normalize.test.ts` | ~75 | Unit tests for normalization |
| `e2e/tui/app-shell.test.ts` (additions) | ~250 | E2E keybinding dispatch, priority, hints |

### Modified files

| Path | Change |
|------|--------|
| `apps/tui/src/index.tsx` | Add `KeybindingProvider` and `GlobalKeybindings` to provider stack |
