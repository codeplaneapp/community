import { useEffect, useSyncExternalStore } from "react";
import { Timeline, engine } from "@opentui/core";
import { isUnicodeSupported } from "../theme/detect.js";

/** Braille spinner frames — Unicode terminals. */
export const BRAILLE_FRAMES = [
  "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
] as const;

/** ASCII spinner frames — non-Unicode terminals. */
export const ASCII_FRAMES = ["-", "\\", "|", "/"] as const;

/** Milliseconds per frame for braille spinners. */
export const BRAILLE_INTERVAL_MS = 80;

/** Milliseconds per frame for ASCII spinners. */
export const ASCII_INTERVAL_MS = 120;

const unicode = isUnicodeSupported();
const FRAMES: readonly string[] = unicode ? BRAILLE_FRAMES : ASCII_FRAMES;
const INTERVAL_MS = unicode ? BRAILLE_INTERVAL_MS : ASCII_INTERVAL_MS;
const CYCLE_DURATION_MS = FRAMES.length * INTERVAL_MS;

/**
 * Module-level mutable state object.
 * The Timeline's onUpdate callback mutates `frameIndex`.
 * React consumers subscribe via useSyncExternalStore.
 */
const state = { frameIndex: 0 };

/** Number of active subscribers (components with active=true). */
let activeCount = 0;

/** Subscriptions for useSyncExternalStore. */
type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string {
  return activeCount > 0 ? FRAMES[state.frameIndex] : "";
}

let timeline: Timeline | null = null;

function ensureTimeline(): Timeline {
  if (!timeline) {
    timeline = new Timeline({
      duration: CYCLE_DURATION_MS,
      loop: true,
      autoplay: false, // We control play/pause manually.
    });

    // Animate frameIndex from 0 → FRAMES.length over the cycle duration.
    // The onUpdate callback discretizes the continuous progress into frame indices.
    timeline.add(
      [state],
      {
        duration: CYCLE_DURATION_MS,
        frameIndex: FRAMES.length,
        ease: "linear",
        loop: true,
        onUpdate: (animation) => {
          const newIndex = Math.min(
            Math.floor(animation.progress * FRAMES.length),
            FRAMES.length - 1
          );
          if (newIndex !== state.frameIndex) {
            state.frameIndex = newIndex;
            emitChange();
          }
        },
      },
      0
    );

    engine.register(timeline);
  }
  return timeline;
}

function activate(): void {
  activeCount++;
  if (activeCount === 1) {
    const tl = ensureTimeline();
    tl.restart();
    emitChange(); // Notify subscribers that spinner is now active.
  }
}

function deactivate(): void {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) {
    timeline?.pause();
    state.frameIndex = 0;
    emitChange(); // Notify subscribers that spinner stopped.
  }
}

/**
 * Shared spinner hook with braille/ASCII animation.
 *
 * Returns a single spinner character string when `active` is true,
 * or an empty string when false. All concurrent active spinners
 * are frame-synchronized.
 *
 * Animation is driven by OpenTUI's Timeline engine, not setInterval.
 *
 * @param active - Whether the spinner should be animating.
 * @returns Current spinner frame character, or "".
 *
 * @example
 * ```tsx
 * const spinner = useSpinner(isLoading);
 * return <text>{spinner} Loading…</text>;
 * ```
 */
export function useSpinner(active: boolean): string {
  useEffect(() => {
    if (active) {
      activate();
      return () => deactivate();
    }
  }, [active]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
