/**
 * Normalize any thrown value into an Error instance.
 *
 * - Error instances: returned as-is.
 * - Strings: wrapped in `new Error(string)`.
 * - Objects with `.message` string: wrapped in `new Error(obj.message)`
 *   with `.stack` preserved if present.
 * - Everything else: `new Error(String(value))`.
 *   If value is `null` or `undefined`: `new Error("Unknown error")`.
 */
export function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;

  if (typeof value === "string") return new Error(value);

  if (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as Record<string, unknown>).message === "string"
  ) {
    const err = new Error((value as { message: string }).message);
    if (
      "stack" in value &&
      typeof (value as Record<string, unknown>).stack === "string"
    ) {
      err.stack = (value as { stack: string }).stack;
    }
    return err;
  }

  if (value === null || value === undefined) {
    return new Error("Unknown error");
  }

  return new Error(String(value));
}
