import { CRASH_LOOP_WINDOW_MS, CRASH_LOOP_MAX_RESTARTS } from "../util/constants.js";

/**
 * Ring buffer size for tracking restart timestamps.
 * Stores the last 5 restart times. Only the most recent entries
 * within CRASH_LOOP_WINDOW_MS are checked against CRASH_LOOP_MAX_RESTARTS.
 */
const RING_BUFFER_SIZE = 5;

export class CrashLoopDetector {
  private timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxRestarts: number;

  constructor(
    windowMs: number = CRASH_LOOP_WINDOW_MS,
    maxRestarts: number = CRASH_LOOP_MAX_RESTARTS,
  ) {
    this.windowMs = windowMs;
    this.maxRestarts = maxRestarts;
  }

  /**
   * Record a restart event and return whether the crash loop
   * threshold has been exceeded.
   *
   * @returns `true` if 3+ restarts have occurred within the 5-second window.
   */
  recordRestart(): boolean {
    const now = Date.now();
    this.timestamps.push(now);

    // Keep ring buffer at fixed size
    if (this.timestamps.length > RING_BUFFER_SIZE) {
      this.timestamps.shift();
    }

    // Count restarts within the window
    const cutoff = now - this.windowMs;
    const recentCount = this.timestamps.filter(t => t >= cutoff).length;
    return recentCount >= this.maxRestarts;
  }

  /**
   * Return the number of restarts recorded in the buffer.
   */
  get restartCount(): number {
    return this.timestamps.length;
  }

  /**
   * Reset the detector state. Used when the TUI runs stably
   * for long enough that old crash timestamps age out naturally.
   */
  reset(): void {
    this.timestamps = [];
  }
}
