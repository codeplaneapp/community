# Codebase Context for `ManagedList` Component

Based on codebase research, here are the architectural patterns, file paths, and context needed to implement the `ManagedList` component.

## 1. Architecture and Component Location
- **Target Implementation File**: `apps/tui/src/components/ManagedList.tsx`
- **OpenTUI Primitives**: The `<box>`, `<scrollbox>`, and `<text>` components are intrinsic elements provided by the `@opentui/react` reconciler.
- **`ScrollableList` Component**: The specification mentions wrapping an "existing `<ScrollableList>` (or standard list iteration pattern)". A standalone `ScrollableList.tsx` does not currently exist in the shared component library. You should implement the standard OpenTUI list iteration pattern inside your component using a scrollbox wrapper:
  ```tsx
  <scrollbox>
    <box flexDirection="column">
      {items.map((item, index) => {
         const isFocused = index === selectedIndex;
         return renderItem(item, isFocused);
      })}
    </box>
  </scrollbox>
  ```

## 2. Keybinding System
The TUI uses a centralized keybinding manager and local keyboard hooks. The specification requires mapping `a`/`c`, `d`/`x`, `p`/`v`, and `Esc`.

You have two available patterns:
1. **`useScreenKeybindings`**: Found in `apps/tui/src/hooks/useScreenKeybindings.ts`. This registers keybindings in the global scope with `PRIORITY.SCREEN`. Best for screen-level keybindings.
2. **`useKeyboard`**: Exported by `@opentui/react`. Best for isolated, component-level key interception.

```typescript
import { useKeyboard } from "@opentui/react";

useKeyboard((event) => {
  if (inFlight) return;
  
  if ((event.name === "a" || event.name === "c") && mode === "list") {
    setMode("add");
  }
  if (event.name === "escape" && mode !== "list") {
    setMode("list");
  }
  // ... other bindings
});
```

## 3. Flash and Toast Messages
The spec references a `tui-sync-toast-flash-system` dependency. Flash messages in the current TUI architecture are traditionally handled via a status bar override. 

If the new flash system hook (`useFlash` or similar) is available via the dependency ticket, you should import and use it. If it is not fully scaffolded yet, the current flash mechanism operates through `useStatusBarHints`:
- **Path**: `apps/tui/src/hooks/useStatusBarHints.ts`
- **Mechanism**: You can temporarily display a flash banner in the status bar by calling `overrideHints([{ keys: "", label: "Your flash message here" }])`. The override handles clearing itself or can be cleared manually.

## 4. State & Focus Management
- **State Requirements**: You'll need standard React hooks `useState` for tracking `mode` (`'list' | 'add' | 'delete'`), `inFlight` (`boolean`), `optimisticItems` (`T[] | null`), and `selectedIndex` (`number`).
- **Focus Behavior**: OpenTUI relies on explicit state tracking for focus. When an item is deleted, ensure your `selectedIndex` bounds-checks against `items.length - 1` so the cursor does not disappear into an invalid index.