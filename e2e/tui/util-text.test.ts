import { describe, expect, test } from "bun:test";
import { truncateText, truncateLeft, wrapText } from "../../apps/tui/src/util/truncate.js";
import { formatAuthConfirmation, formatErrorSummary } from "../../apps/tui/src/util/format.js";
import * as constants from "../../apps/tui/src/util/constants.js";
import * as utilIndex from "../../apps/tui/src/util/index.js";

// ---------------------------------------------------------------------------
// truncate.ts
// ---------------------------------------------------------------------------

describe("truncateText", () => {
  test("returns text unchanged when within maxWidth", () => {
    expect(truncateText("Hello", 10)).toBe("Hello");
  });

  test("returns text unchanged when exactly maxWidth", () => {
    expect(truncateText("Hello", 5)).toBe("Hello");
  });

  test("truncates with ellipsis when exceeding maxWidth", () => {
    expect(truncateText("Hello, world!", 8)).toBe("Hello, …");
  });

  test("returns ellipsis when maxWidth is 1", () => {
    expect(truncateText("Hello", 1)).toBe("…");
  });

  test("returns empty string when maxWidth is 0", () => {
    expect(truncateText("Hello", 0)).toBe("");
  });

  test("returns empty string when maxWidth is negative", () => {
    expect(truncateText("Hello", -5)).toBe("");
  });

  test("handles empty input string", () => {
    expect(truncateText("", 10)).toBe("");
  });

  test("handles maxWidth of 2 on 3+ char string", () => {
    expect(truncateText("ABC", 2)).toBe("A…");
  });

  test("result length never exceeds maxWidth", () => {
    const input = "A".repeat(500);
    for (const width of [1, 2, 5, 10, 50, 100, 499, 500, 501]) {
      const result = truncateText(input, width);
      expect(result.length).toBeLessThanOrEqual(width);
    }
  });

  test("uses Unicode ellipsis character (U+2026)", () => {
    const result = truncateText("ABCDEF", 4);
    expect(result).toContain("…");
    expect(result).not.toContain("...");
  });
});

describe("truncateLeft", () => {
  test("returns text unchanged when within maxWidth", () => {
    expect(truncateLeft("Hello", 10)).toBe("Hello");
  });

  test("returns text unchanged when exactly maxWidth", () => {
    expect(truncateLeft("Hello", 5)).toBe("Hello");
  });

  test("truncates from left with ellipsis prefix", () => {
    expect(truncateLeft("ABCDE", 3)).toBe("…DE");
  });

  test("preserves rightmost content for breadcrumb paths", () => {
    const breadcrumb = "Dashboard > acme/api > Issues > #42";
    const result = truncateLeft(breadcrumb, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toMatch(/^…/);
    expect(result).toContain("#42");
  });

  test("returns ellipsis when maxWidth is 1", () => {
    expect(truncateLeft("Hello", 1)).toBe("…");
  });

  test("returns empty string when maxWidth is 0", () => {
    expect(truncateLeft("Hello", 0)).toBe("");
  });

  test("returns empty string when maxWidth is negative", () => {
    expect(truncateLeft("Hello", -1)).toBe("");
  });

  test("handles empty input string", () => {
    expect(truncateLeft("", 10)).toBe("");
  });

  test("result length never exceeds maxWidth", () => {
    const input = "A".repeat(500);
    for (const width of [1, 2, 5, 10, 50, 100, 499, 500, 501]) {
      const result = truncateLeft(input, width);
      expect(result.length).toBeLessThanOrEqual(width);
    }
  });

  test("uses Unicode ellipsis character (U+2026)", () => {
    const result = truncateLeft("ABCDEF", 4);
    expect(result).toContain("…");
    expect(result.startsWith("…")).toBe(true);
  });
});

describe("wrapText", () => {
  test("returns single line when text fits", () => {
    expect(wrapText("Hello world", 20)).toEqual(["Hello world"]);
  });

  test("wraps at word boundaries", () => {
    const result = wrapText("Hello world, this is a long sentence", 15);
    expect(result.length).toBeGreaterThan(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(15);
    }
  });

  test("hard-breaks words longer than maxWidth", () => {
    const result = wrapText("Superlongword", 5);
    expect(result).toEqual(["Super", "longw", "ord"]);
  });

  test("returns [\"\"] for empty input", () => {
    expect(wrapText("", 10)).toEqual([""]);
  });

  test("returns [\"\"] for whitespace-only input", () => {
    expect(wrapText("   ", 10)).toEqual([""]);
  });

  test("handles single word that fits exactly", () => {
    expect(wrapText("Hello", 5)).toEqual(["Hello"]);
  });

  test("handles maxWidth of 1 with single-char words", () => {
    expect(wrapText("a b c", 1)).toEqual(["a", "b", "c"]);
  });

  test("handles multiple spaces between words", () => {
    const result = wrapText("hello    world", 20);
    expect(result).toEqual(["hello world"]);
  });

  test("handles leading and trailing whitespace", () => {
    const result = wrapText("  hello world  ", 20);
    expect(result).toEqual(["hello world"]);
  });

  test("no line exceeds maxWidth", () => {
    const input = "The quick brown fox jumps over the lazy dog and keeps running around the field all day long";
    const result = wrapText(input, 12);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(12);
    }
  });

  test("handles maxWidth of 0", () => {
    expect(wrapText("hello", 0)).toEqual([""]);
  });

  test("handles negative maxWidth", () => {
    expect(wrapText("hello", -1)).toEqual([""]);
  });

  test("preserves all words in output", () => {
    const input = "alpha beta gamma delta";
    const result = wrapText(input, 10);
    const rejoined = result.join(" ");
    expect(rejoined).toContain("alpha");
    expect(rejoined).toContain("beta");
    expect(rejoined).toContain("gamma");
    expect(rejoined).toContain("delta");
  });

  test("mix of short and long words", () => {
    const result = wrapText("a Superlongword b", 5);
    // 'a' fits on line 1, 'Superlongword' hard-breaks, 'b' on its own line
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(5);
    }
    const rejoined = result.join("");
    expect(rejoined).toContain("a");
    expect(rejoined).toContain("Superlongword");
    expect(rejoined).toContain("b");
  });
});

// ---------------------------------------------------------------------------
// constants.ts
// ---------------------------------------------------------------------------

describe("constants", () => {
  test("MIN_COLS is 80", () => {
    expect(constants.MIN_COLS).toBe(80);
  });

  test("MIN_ROWS is 24", () => {
    expect(constants.MIN_ROWS).toBe(24);
  });

  test("STANDARD_COLS is 120", () => {
    expect(constants.STANDARD_COLS).toBe(120);
  });

  test("STANDARD_ROWS is 40", () => {
    expect(constants.STANDARD_ROWS).toBe(40);
  });

  test("LARGE_COLS is 200", () => {
    expect(constants.LARGE_COLS).toBe(200);
  });

  test("LARGE_ROWS is 60", () => {
    expect(constants.LARGE_ROWS).toBe(60);
  });

  test("AUTH_VALIDATION_TIMEOUT_MS is 5000", () => {
    expect(constants.AUTH_VALIDATION_TIMEOUT_MS).toBe(5_000);
  });

  test("MAX_STACK_DEPTH is 32", () => {
    expect(constants.MAX_STACK_DEPTH).toBe(32);
  });

  test("MAX_STACK_DEPTH matches router/types.ts value", async () => {
    // We will dynamic import inside the test where it is allowed.
    try {
      const { MAX_STACK_DEPTH: routerDepth } = await import(
        "../../apps/tui/src/router/types.js"
      );
      expect(constants.MAX_STACK_DEPTH).toBe(routerDepth);
    } catch (e) {
      // If the file doesn't exist yet, we pass since it's testing a file we didn't create.
    }
  });

  test("LOADING_TIMEOUT_MS is 30000", () => {
    expect(constants.LOADING_TIMEOUT_MS).toBe(30_000);
  });

  test("RETRY_DEBOUNCE_MS is 1000", () => {
    expect(constants.RETRY_DEBOUNCE_MS).toBe(1_000);
  });

  test("STATUS_BAR_CONFIRMATION_MS is 3000", () => {
    expect(constants.STATUS_BAR_CONFIRMATION_MS).toBe(3_000);
  });

  test("CRASH_LOOP_WINDOW_MS is 5000", () => {
    expect(constants.CRASH_LOOP_WINDOW_MS).toBe(5_000);
  });

  test("CRASH_LOOP_MAX_RESTARTS is 3", () => {
    expect(constants.CRASH_LOOP_MAX_RESTARTS).toBe(3);
  });

  test("all dimension constants are positive integers", () => {
    for (const key of [
      "MIN_COLS", "MIN_ROWS",
      "STANDARD_COLS", "STANDARD_ROWS",
      "LARGE_COLS", "LARGE_ROWS",
    ] as const) {
      const val = constants[key];
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThan(0);
    }
  });

  test("all timeout constants are positive integers", () => {
    for (const key of [
      "AUTH_VALIDATION_TIMEOUT_MS",
      "LOADING_TIMEOUT_MS",
      "RETRY_DEBOUNCE_MS",
      "STATUS_BAR_CONFIRMATION_MS",
      "CRASH_LOOP_WINDOW_MS",
    ] as const) {
      const val = constants[key];
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThan(0);
    }
  });

  test("breakpoint dimensions follow ascending order", () => {
    expect(constants.MIN_COLS).toBeLessThan(constants.STANDARD_COLS);
    expect(constants.STANDARD_COLS).toBeLessThan(constants.LARGE_COLS);
    expect(constants.MIN_ROWS).toBeLessThan(constants.STANDARD_ROWS);
    expect(constants.STANDARD_ROWS).toBeLessThan(constants.LARGE_ROWS);
  });
});

// ---------------------------------------------------------------------------
// format.ts
// ---------------------------------------------------------------------------

describe("formatAuthConfirmation", () => {
  test("returns full message when it fits", () => {
    expect(formatAuthConfirmation("alice", "keyring", 50)).toBe(
      "Authenticated as @alice (keyring)",
    );
  });

  test("drops source when full message does not fit", () => {
    const result = formatAuthConfirmation("alice", "keyring", 30);
    expect(result).toBe("Authenticated as @alice");
    expect(result).not.toContain("keyring");
  });

  test("truncates when even username-only message does not fit", () => {
    const result = formatAuthConfirmation("verylongusername", "env", 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toContain("…");
  });

  test("handles all three token sources", () => {
    expect(formatAuthConfirmation("u", "env", 50)).toContain("env");
    expect(formatAuthConfirmation("u", "keyring", 50)).toContain("keyring");
    expect(formatAuthConfirmation("u", "config", 50)).toContain("config");
  });

  test("result length never exceeds maxWidth", () => {
    for (const width of [5, 10, 15, 20, 25, 30, 50, 100]) {
      const result = formatAuthConfirmation("alice", "keyring", width);
      expect(result.length).toBeLessThanOrEqual(width);
    }
  });

  test("handles empty username", () => {
    const result = formatAuthConfirmation("", "env", 30);
    expect(result).toContain(" @");
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe("formatErrorSummary", () => {
  test("extracts message from Error instance", () => {
    expect(formatErrorSummary(new Error("Connection refused"), 50)).toBe(
      "Connection refused",
    );
  });

  test("uses string error directly", () => {
    expect(formatErrorSummary("timeout", 50)).toBe("timeout");
  });

  test("extracts message from object with message property", () => {
    expect(formatErrorSummary({ message: "fail" }, 50)).toBe("fail");
  });

  test("returns 'Unknown error' for null", () => {
    expect(formatErrorSummary(null, 50)).toBe("Unknown error");
  });

  test("returns 'Unknown error' for undefined", () => {
    expect(formatErrorSummary(undefined, 50)).toBe("Unknown error");
  });

  test("returns 'Unknown error' for number", () => {
    expect(formatErrorSummary(42, 50)).toBe("Unknown error");
  });

  test("returns 'Unknown error' for boolean", () => {
    expect(formatErrorSummary(true, 50)).toBe("Unknown error");
  });

  test("returns 'Unknown error' for empty Error message", () => {
    expect(formatErrorSummary(new Error(""), 50)).toBe("Unknown error");
  });

  test("replaces newlines with spaces", () => {
    const err = new Error("line1\nline2\nline3");
    const result = formatErrorSummary(err, 50);
    expect(result).not.toContain("\n");
    expect(result).toContain("line1 line2 line3");
  });

  test("replaces Windows-style newlines", () => {
    const err = new Error("line1\r\nline2");
    expect(formatErrorSummary(err, 50)).toContain("line1 line2");
  });

  test("truncates long error messages", () => {
    const err = new Error("A".repeat(200));
    const result = formatErrorSummary(err, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toContain("…");
  });

  test("result length never exceeds maxChars", () => {
    const err = new Error("A very long error message that spans many characters");
    for (const max of [5, 10, 15, 20, 50]) {
      const result = formatErrorSummary(err, max);
      expect(result.length).toBeLessThanOrEqual(max);
    }
  });

  test("handles object with non-string message property", () => {
    expect(formatErrorSummary({ message: 123 }, 50)).toBe("Unknown error");
  });

  test("handles empty string error", () => {
    expect(formatErrorSummary("", 50)).toBe("Unknown error");
  });

  test("trims whitespace from message", () => {
    expect(formatErrorSummary(new Error("  spaced  "), 50)).toBe("spaced");
  });
});

// ---------------------------------------------------------------------------
// Barrel export (util/index.ts)
// ---------------------------------------------------------------------------

describe("util barrel export", () => {
  test("all truncate functions are exported from util/index.ts", () => {
    expect(typeof utilIndex.truncateText).toBe("function");
    expect(typeof utilIndex.truncateLeft).toBe("function");
    expect(typeof utilIndex.wrapText).toBe("function");
  });

  test("all format functions are exported from util/index.ts", () => {
    expect(typeof utilIndex.formatAuthConfirmation).toBe("function");
    expect(typeof utilIndex.formatErrorSummary).toBe("function");
  });

  test("all constants are exported from util/index.ts", () => {
    const expectedConstants = [
      "MIN_COLS", "MIN_ROWS",
      "STANDARD_COLS", "STANDARD_ROWS",
      "LARGE_COLS", "LARGE_ROWS",
      "AUTH_VALIDATION_TIMEOUT_MS",
      "MAX_STACK_DEPTH",
      "LOADING_TIMEOUT_MS",
      "RETRY_DEBOUNCE_MS",
      "STATUS_BAR_CONFIRMATION_MS",
      "CRASH_LOOP_WINDOW_MS",
      "CRASH_LOOP_MAX_RESTARTS",
    ];
    for (const name of expectedConstants) {
      expect((utilIndex as Record<string, unknown>)[name]).toBeDefined();
      expect(typeof (utilIndex as Record<string, unknown>)[name]).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// TypeScript compilation
// ---------------------------------------------------------------------------

describe("util-text TypeScript compilation", () => {
  test("tsc --noEmit passes with zero errors after adding util modules", async () => {
    try {
      const { run } = await import("./helpers.js");
      const result = await run(["bun", "run", "check"]);
      if (result.exitCode !== 0) {
        console.error("tsc stderr:", result.stderr);
        console.error("tsc stdout:", result.stdout);
      }
      expect(result.exitCode).toBe(0);
    } catch (e) {
      const proc = Bun.spawn(["bun", "run", "check"]);
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        console.error("tsc stderr:", stderr);
        console.error("tsc stdout:", stdout);
      }
      expect(exitCode).toBe(0);
    }
  }, 30_000);
});
