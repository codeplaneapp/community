import { useEffect, useRef } from "react";

let globalThrowCount = 0;

export function TestCrashHook() {
  const hasMounted = useRef(false);

  if (process.env.CODEPLANE_TUI_TEST_THROW === "1" && !hasMounted.current) {
    hasMounted.current = true;
    const msg = process.env.CODEPLANE_TUI_TEST_ERROR_MESSAGE ?? "Test error";

    if (process.env.CODEPLANE_TUI_TEST_NO_STACK === "1") {
      throw { message: msg }; // Object without .stack
    }
    if (process.env.CODEPLANE_TUI_TEST_THROW_STRING === "1") {
      throw msg; // String throw
    }
    throw new Error(msg);
  }

  if (process.env.CODEPLANE_TUI_TEST_THROW_ALWAYS === "1") {
    throw new Error(
      process.env.CODEPLANE_TUI_TEST_ERROR_MESSAGE ?? "Persistent test error",
    );
  }

  if (process.env.CODEPLANE_TUI_TEST_THROW_ONCE === "1") {
    if (globalThrowCount === 0) {
      globalThrowCount++;
      throw new Error("Test error (once)");
    }
  }

  const maxCount = parseInt(
    process.env.CODEPLANE_TUI_TEST_THROW_COUNT ?? "0",
    10,
  );
  if (maxCount > 0 && globalThrowCount < maxCount) {
    globalThrowCount++;
    throw new Error(`Test error (${globalThrowCount}/${maxCount})`);
  }

  if (process.env.CODEPLANE_TUI_TEST_THROW_TWICE === "1") {
    if (globalThrowCount < 2) {
      globalThrowCount++;
      throw new Error("Test error (twice)");
    }
  }

  if (process.env.CODEPLANE_TUI_TEST_DOUBLE_FAULT === "1") {
    // If double fault is needed, the ErrorBoundary needs to throw during render.
    // The test framework sets this env variable, but the crash needs to happen inside ErrorScreen.
    // Since we don't modify ErrorScreen just for tests, we can throw from here, and if the environment variable
    // is set, ErrorScreen can optionally throw. However, the spec says "Codeplane_TUI_TEST_DOUBLE_FAULT=1" should test it.
    // Let's modify ErrorScreen to optionally throw if this is set, or just let TestCrashHook handle initial throw,
    // and let ErrorScreen handle the second throw.
    throw new Error("Primary fault");
  }

  useEffect(() => {
    const delayMs = parseInt(
      process.env.CODEPLANE_TUI_TEST_THROW_AFTER_MS ?? "0",
      10,
    );
    if (delayMs > 0) {
      const timer = setTimeout(() => {
        throw new Error("Delayed test error");
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, []);

  return null;
}
