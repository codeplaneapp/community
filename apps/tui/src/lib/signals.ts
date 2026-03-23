import type { CliRenderer } from "@opentui/core";

let isShuttingDown = false;
let globalAbort: AbortController | null = null;

export function setGlobalAbort(controller: AbortController) {
  globalAbort = controller;
}

export function registerSignalHandlers(
  renderer: CliRenderer,
  cleanup?: () => void
): void {
  const teardown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    globalAbort?.abort();

    if (process.env.CODEPLANE_TUI_DEBUG === "true") {
      process.stderr.write(
        JSON.stringify({
          component: "tui",
          phase: "teardown",
          level: "info",
          message: "Graceful shutdown started",
          trigger: signal,
        }) + "\n"
      );
    }

    try {
      cleanup?.();
      renderer.stop();
    } catch {
      // Best-effort cleanup
    }

    process.exit(0);
  };

  process.on("SIGINT", () => teardown("sigint"));
  process.on("SIGTERM", () => teardown("sigterm"));
  process.on("SIGHUP", () => teardown("sighup"));
}

export function resetShutdownState(): void {
  isShuttingDown = false;
}
