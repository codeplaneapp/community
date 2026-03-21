import { describe, test, expect } from "bun:test";
import { EventDeduplicator } from "../../../apps/tui/src/streaming/EventDeduplicator";

describe("EventDeduplicator", () => {

  test("first occurrence of an event ID is not a duplicate", () => {
    const dedup = new EventDeduplicator(100);
    expect(dedup.isDuplicate("event-1")).toBe(false);
  });

  test("second occurrence of the same event ID is a duplicate", () => {
    const dedup = new EventDeduplicator(100);
    dedup.isDuplicate("event-1");
    expect(dedup.isDuplicate("event-1")).toBe(true);
  });

  test("different event IDs are not duplicates", () => {
    const dedup = new EventDeduplicator(100);
    dedup.isDuplicate("event-1");
    expect(dedup.isDuplicate("event-2")).toBe(false);
  });

  test("events without IDs are never duplicates", () => {
    const dedup = new EventDeduplicator(100);
    expect(dedup.isDuplicate("")).toBe(false);
    expect(dedup.isDuplicate("")).toBe(false);
  });

  test("sliding window evicts oldest IDs when full", () => {
    const dedup = new EventDeduplicator(3);
    dedup.isDuplicate("a");
    dedup.isDuplicate("b");
    dedup.isDuplicate("c");
    dedup.isDuplicate("d");

    expect(dedup.has("a")).toBe(false); // evicted
    expect(dedup.has("b")).toBe(true);  // still tracked
    expect(dedup.has("c")).toBe(true);  // still tracked
    expect(dedup.has("d")).toBe(true);  // just added
  });

  test("size tracks the number of tracked event IDs", () => {
    const dedup = new EventDeduplicator(100);
    expect(dedup.size).toBe(0);
    dedup.isDuplicate("a");
    expect(dedup.size).toBe(1);
    dedup.isDuplicate("b");
    expect(dedup.size).toBe(2);
    dedup.isDuplicate("a"); // duplicate, no size change
    expect(dedup.size).toBe(2);
  });

  test("reset clears all tracked IDs", () => {
    const dedup = new EventDeduplicator(100);
    dedup.isDuplicate("a");
    dedup.isDuplicate("b");
    dedup.reset();

    expect(dedup.size).toBe(0);
    expect(dedup.has("a")).toBe(false);
    expect(dedup.has("b")).toBe(false);
  });

  test("handles 1000-element sliding window correctly", () => {
    const dedup = new EventDeduplicator(1000);
    for (let i = 0; i < 1000; i++) {
      expect(dedup.isDuplicate(`event-${i}`)).toBe(false);
    }
    expect(dedup.size).toBe(1000);

    expect(dedup.has("event-999")).toBe(true);
    expect(dedup.has("event-0")).toBe(true);

    dedup.isDuplicate("event-1000"); // adds 1000, evicts 0
    expect(dedup.has("event-1000")).toBe(true);
    expect(dedup.has("event-0")).toBe(false); // evicted
    expect(dedup.has("event-1")).toBe(true);  // still tracked
  });

  test("window size of 1 only tracks the most recent event", () => {
    const dedup = new EventDeduplicator(1);
    dedup.isDuplicate("a");
    expect(dedup.has("a")).toBe(true);

    dedup.isDuplicate("b");
    expect(dedup.has("a")).toBe(false); // evicted
    expect(dedup.has("b")).toBe(true);
  });
});
