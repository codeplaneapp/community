# Research: TUI Sync Resolve Actions

## 1. Context & Missing Surface
The destination folder `apps/tui/src/screens/Sync/` and its corresponding subdirectories (`hooks/`, `components/`) do not exist yet. This feature implementation will scaffold these paths as per the engineering specification.

Required hooks to be imported from `@codeplane/ui-core` (assumed provided by the shared API layer based on spec documentation, notably `TUI_SYNC_CONFLICT_LIST.md` and `TUI_SYNC_RESOLVE_ACTION.md`):
- `useConflictResolve()` → `POST /api/daemon/conflicts/:id/resolve`
- `useConflictRetry()` → `POST /api/daemon/conflicts/:id/retry`

## 2. Keybinding & Focus Architecture
The Codeplane TUI handles keyboard interactions centrally via `KeybindingProvider.tsx` (`apps/tui/src/providers/KeybindingProvider.tsx:71`). Screens register contextual hotkeys using the `useScreenKeybindings` hook (`apps/tui/src/hooks/useScreenKeybindings.ts:18`).

For the resolve actions (`d` for discard, `y` for retry):
- **Keybindings:** Should be wired via `useScreenKeybindings` inside `SyncConflictList` or the overarching `SyncStatusScreen`.
- **Hints:** Contextual hints (`d:discard`, `y:retry`, `Enter:detail`) should be conditionally passed to `useScreenKeybindings` or pushed directly to the `StatusBarHintsContext` depending on the currently focused item's state (`conflict` vs `failed`).
- **Suppression:** The spec mandates suppressing `d` and `y` when the filter input (`/`) is active. This naturally aligns with OpenTUI's input focus capture, but explicit condition checks (`!isFilterFocused`) inside the key handlers are required because global handlers can sometimes preempt inputs if priorities aren't aligned.

## 3. Modal & Overlay Patterns
The Codeplane TUI relies on OpenTUI's layout primitives for modals. Existing implementations (e.g., `OverlayLayer.tsx` and design specs) use absolute positioning to trap focus and overlap the screen.

**Modal Wrapper Pattern:**
```tsx
<box
  position="absolute"
  top="center"
  left="center"
  width="50%" // Scaled responsively via useLayout: 90% (80x24), 50% (120x40), 40% (200x60)
  zIndex={20} // Stacked above detail modal (which typically uses zIndex=10)
  border="single"
  borderColor={theme.error} // Red border for destructive "discard" action
>
  {/* Content */}
</box>
```
Modals must trap focus. The spec dictates that pressing `d` inside the `ErrorDetailModal` (zIndex 10) must render a confirmation modal layered on top (zIndex 20).

## 4. In-Flight Guards & Optimistic UI
**In-Flight Guard (`useInFlightGuard`)**:
- Needs to maintain a `Set<string>` of resolving IDs using `useState` or a ref combined with forced re-renders.
- Must wrap API calls to prevent rapid sequential keypresses (e.g., hitting `y` multiple times).
- Needs a safety timeout (e.g., 30s) built using `setTimeout` within the hook to gracefully purge stalled IDs.

**Optimistic UI Layer**:
- **Discard:** Mapped via `optimisticDiscards` (a `Set<string>`). Filtered out of the rendered list completely. Merges against the periodic 3s polling (`useSyncConflicts`).
- **Retry:** Mapped via `optimisticRetries` (a `Map<string, 'pending'>` or `Set<string>`). Row stays visible but its status badge immediately switches to yellow (`pending`).

## 5. Flash Notifications
Transient status messages (e.g., "Conflict discarded", "Item queued for retry") need to be rendered. Depending on the global TUI shell implementation, this either targets a central toast/flash dispatcher or is rendered locally in the screen via an absolute positioned `<box position="absolute" top={1} left={0} width="100%" height={1} zIndex={5}>` (as detailed in `tui-sync-toast-flash-system.md`).

## 6. Focus Fallback Management
When a row is discarded, it is optimistically removed from the UI. The index of the focused item must be recalibrated:
- Advance to the *next* item index if available.
- If the discarded item was the last in the list, fall back to the *previous* index.
- If it was the *only* item, shift into an empty state.
This state mapping should execute synchronously inside the `onConfirm` callback of the discard modal before the modal unmounts.