import { useEffect, useRef } from "react";

export interface SessionListKeybindingActions {
  moveFocusDown: () => void;
  moveFocusUp: () => void;
  jumpToFirst: () => void;
  jumpToLast: () => void;
  pageDown: () => void;
  pageUp: () => void;
  openSession: () => void;
  createSession: () => void;
  deleteSession: () => void;
  replaySession: () => void;
  cycleFilter: () => void;
  focusSearch: () => void;
  toggleSelection: () => void;
  retryFetch: () => void;
  popScreen: () => void;
  isSearchFocused: boolean;
  isOverlayOpen: boolean;
  isErrorState: boolean;
  hasSearchText: boolean;
}

/**
 * Registers keybindings for the AgentSessionListScreen.
 *
 * Priority chain:
 * 1. Search input focused → printable keys type into input; Esc clears.
 * 2. Delete overlay open → Enter confirms, Esc cancels.
 * 3. Screen-specific: j/k/Enter/n/d/r/f/G/gg/Space/q/R.
 * 4. Global: ?/:/ Ctrl+C.
 *
 * Productionize: uncomment useKeyboard handler when @opentui/react ships.
 */
export function useSessionListKeybindings(
  actions: SessionListKeybindingActions,
  statusBarHints: string,
): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Stub: will use useKeyboard from @opentui/react.
  // Key dispatch logic:
  //
  // if (a.isSearchFocused) { if (key==Esc) clearSearch; return; }
  // if (a.isOverlayOpen) { if (key==Enter) confirm; if (key==Esc) cancel; return; }
  // switch (key) {
  //   case "j"/"ArrowDown": moveFocusDown; break;
  //   case "k"/"ArrowUp": moveFocusUp; break;
  //   case "Enter": openSession; break;
  //   case "G": jumpToLast; break;
  //   case "n": createSession; break;
  //   case "d": deleteSession; break;
  //   case "r": replaySession; break;
  //   case "f": cycleFilter; break;
  //   case "/": focusSearch; break;
  //   case " ": toggleSelection; break;
  //   case "R": retryFetch; break;
  //   case "q": popScreen; break;
  // }
  // g g handled via go-to mode with 1500ms timeout.
  // Ctrl+D/Ctrl+U via modifier detection.
}
