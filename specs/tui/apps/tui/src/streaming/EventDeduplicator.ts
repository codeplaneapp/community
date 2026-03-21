import { SSE_CONSTANTS } from "./types";

/**
 * Sliding-window event deduplicator.
 *
 * On SSE reconnection with Last-Event-ID, the server replays events
 * from the last known position. This deduplicator ensures replayed
 * events are not processed twice.
 *
 * Implementation uses a circular buffer + Set for O(1) lookup and
 * bounded memory. When the window is full, the oldest ID is evicted
 * from both the buffer and the Set before the new ID is inserted.
 */
export class EventDeduplicator {
  private readonly maxSize: number;
  private readonly seenIds: Set<string>;
  private readonly buffer: string[];
  private writeIndex: number;

  constructor(maxSize: number = SSE_CONSTANTS.DEDUP_WINDOW_SIZE) {
    this.maxSize = maxSize;
    this.seenIds = new Set();
    this.buffer = new Array(maxSize);
    this.writeIndex = 0;
  }

  /**
   * Pure check if an event ID is currently tracked.
   * Useful for testing.
   */
  has(eventId: string): boolean {
    return this.seenIds.has(eventId);
  }

  /**
   * Check if an event ID has been seen before.
   * If not seen, records it and returns false (not duplicate).
   * If seen, returns true (duplicate — caller should skip).
   */
  isDuplicate(eventId: string): boolean {
    if (!eventId) return false; // Events without IDs are never deduplicated

    if (this.seenIds.has(eventId)) {
      return true;
    }

    // Evict oldest if at capacity
    if (this.seenIds.size >= this.maxSize) {
      const evictId = this.buffer[this.writeIndex];
      if (evictId !== undefined) {
        this.seenIds.delete(evictId);
      }
    }

    this.buffer[this.writeIndex] = eventId;
    this.seenIds.add(eventId);
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;

    return false;
  }

  /**
   * Reset deduplication state. Called when a fresh connection
   * is established without Last-Event-ID replay.
   */
  reset(): void {
    this.seenIds.clear();
    this.buffer.fill(undefined as unknown as string);
    this.writeIndex = 0;
  }

  /** Current number of tracked event IDs. */
  get size(): number {
    return this.seenIds.size;
  }
}
