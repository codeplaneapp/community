type LogLevel = "error" | "warn" | "info" | "debug";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function getConfiguredLevel(): LogLevel {
  const env = process.env.CODEPLANE_TUI_LOG_LEVEL;
  if (env && env in LOG_LEVEL_PRIORITY) return env as LogLevel;
  if (process.env.CODEPLANE_TUI_DEBUG === "true") return "debug";
  return "error";
}

const configuredLevel = getConfiguredLevel();
const configuredPriority = LOG_LEVEL_PRIORITY[configuredLevel];

export function log(level: LogLevel, message: string): void {
  if (LOG_LEVEL_PRIORITY[level] > configuredPriority) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [${level.toUpperCase()}] ${message}\n`);
}

export const logger = {
  error: (msg: string) => log("error", msg),
  warn: (msg: string) => log("warn", msg),
  info: (msg: string) => log("info", msg),
  debug: (msg: string) => log("debug", msg),
};
