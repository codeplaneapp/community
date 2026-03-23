import { describe, expect, test } from "bun:test";
import { normalizeKeyEvent, normalizeKeyDescriptor } from "../../apps/tui/src/providers/normalize-key.js";

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
