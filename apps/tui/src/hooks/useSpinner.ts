import { useEffect, useSyncExternalStore } from "react";
import { Timeline, engine } from "@opentui/core";
import { isUnicodeSupported } from "../theme/detect.js";

// ── Constants ────────────────────────────────────────────────────────

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

// ── Resolved frame configuration (determined once at module load) ───

const unicode = isUnicodeSupported();
const FRAMES: readonly string[] = unicode ? BRAILLE_FRAMES : ASCII_FRAMES;
const INTERVAL_MS = unicode ? BRAILLE_INTERVAL_MS : ASCII_INTERVAL_MS;
const CYCLE_DURATION_MS = FRAMES.length * INTERVAL_MS;

// ── Module-level singleton state ────────────────────────────────────

/**
 * Current frame index. Updated by the Timeline's onUpdate callback.
 * This is the source of truth for what frame character to display.
 */
let currentFrameIndex = 0;

/**
 * Last emitted frame index. Used to avoid redundant emitChange() calls.
 * Timeline.add() interpolates target properties as floats before onUpdate
 * fires, so we compare against this dedicated integer, NOT against any
 * property that Timeline may have written float values into.
 */
let lastEmittedIndex = 0;

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

/**
 * Returns the current spinner frame, or empty string if no consumers
 * are active. This is the GLOBAL snapshot — per-caller active gating
 * is applied in the useSpinner hook itself.
 */
function getSnapshot(): string {
  return activeCount > 0 ? FRAMES[currentFrameIndex] : "";
}

// ── Timeline lifecycle ──────────────────────────────────────────────

/**
 * Opaque animation target. We do NOT use a real state object as the
 * animation target because Timeline interpolates properties as floats.
 * Instead we use a throwaway object and compute frame index from
 * animation.progress in onUpdate.
 */
const animTarget = { _progress: 0 };

let timeline: Timeline | null = null;

function ensureTimeline(): Timeline {
  if (!timeline) {
    timeline = new Timeline({
      duration: CYCLE_DURATION_MS,
      loop: true,
      autoplay: false, // We control play/pause manually.
    });

    // Animate a throwaway property. The real work happens in onUpdate
    // where we discretize continuous progress into frame indices.
    timeline.add(
      [animTarget],
      {
        duration: CYCLE_DURATION_MS,
        _progress: 1, // Animate from 0 to 1 (throwaway, never read).
        ease: "linear",
        loop: true,
        onUpdate: (animation) => {
          const newIndex = Math.min(
            Math.floor(animation.progress * FRAMES.length),
            FRAMES.length - 1
          );
          if (newIndex !== lastEmittedIndex) {
            lastEmittedIndex = newIndex;
            currentFrameIndex = newIndex;
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
    currentFrameIndex = 0;
    lastEmittedIndex = 0;
    emitChange(); // Notify subscribers that spinner stopped.
  }
}

// ── Public hook ─────────────────────────────────────────────────────

/**
 * Shared spinner hook with braille/ASCII animation.
 *
 * Returns a single spinner character string when `active` is true,
 * or an empty string when false. All concurrent active spinners
 * are frame-synchronized.
 *
 * Animation is driven by OpenTUI's Timeline engine, not setInterval.
 *
 * Per-caller gating: even if another component has an active spinner,
 * this hook returns "" when the caller's `active` is false. This
 * prevents spinners from appearing on non-loading components.
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

  const frame = useSyncExternalStore(subscribe, getSnapshot);
  // Per-caller gating: the global snapshot may have a frame because
  // another component is active, but THIS caller wants inactive.
  return active ? frame : "";
}
