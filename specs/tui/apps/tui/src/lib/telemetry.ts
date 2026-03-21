interface TelemetryEvent {
  name: string;
  properties: Record<string, string | number | boolean>;
  timestamp: string; // ISO 8601
}

interface TelemetryContext {
  session_id: string;
  tui_version: string;
  terminal_width: number;
  terminal_height: number;
  color_tier: "truecolor" | "ansi256" | "ansi16";
}

let globalContext: TelemetryContext | null = null;

/**
 * Initialize the telemetry context. Called once at TUI startup.
 * Must be called before any `emit()` calls.
 */
export function initTelemetry(ctx: TelemetryContext): void {
  globalContext = ctx;
}

/**
 * Update mutable context fields (terminal dimensions change on resize).
 */
export function updateTelemetryDimensions(
  width: number,
  height: number,
): void {
  if (globalContext) {
    globalContext.terminal_width = width;
    globalContext.terminal_height = height;
  }
}

/**
 * Emit a telemetry event. In the current implementation, events are
 * written to stderr as JSON when CODEPLANE_TUI_DEBUG is set.
 * Future: replace with analytics SDK transport.
 */
export function emit(
  name: string,
  properties: Record<string, string | number | boolean> = {},
): void {
  const event: TelemetryEvent = {
    name,
    properties: {
      ...properties,
      ...(globalContext ?? {}),
    },
    timestamp: new Date().toISOString(),
  };

  if (process.env.CODEPLANE_TUI_DEBUG === "true") {
    process.stderr.write(JSON.stringify(event) + "\n");
  }

  // Future: send to analytics endpoint
}
