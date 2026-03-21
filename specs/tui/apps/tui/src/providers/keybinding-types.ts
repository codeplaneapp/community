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
