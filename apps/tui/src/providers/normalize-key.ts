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
