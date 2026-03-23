#!/usr/bin/env bun
/**
 * Codeplane TUI — Entry point
 *
 * Bootstrap sequence:
 *   1. TTY assertion (< 5ms)
 *   2. CLI arg parsing (< 1ms)
 *   3. Terminal setup via createCliRenderer() (< 50ms)
 *   4. React root creation via createRoot() (< 10ms)
 *   5. Provider stack mount + render (< 50ms)
 *   6. Signal handler registration (< 1ms)
 *   7. First meaningful paint target: < 200ms total
 */

import { assertTTY, parseCLIArgs } from "./lib/terminal.js";

assertTTY();
const launchOptions = parseCLIArgs(process.argv.slice(2));

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React, { useState, useCallback, useRef } from "react";

import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { AuthProvider } from "./providers/AuthProvider.js";
import { ThemeProvider } from "./providers/ThemeProvider.js";
import { NavigationProvider } from "./providers/NavigationProvider.js";
import { SSEProvider } from "./providers/SSEProvider.js";
import { AppShell } from "./components/AppShell.js";
import { GlobalKeybindings } from "./components/GlobalKeybindings.js";
import { ScreenRouter } from "./router/ScreenRouter.js";
import { registerSignalHandlers } from "./lib/signals.js";
import { resolveDeepLink } from "./navigation/deepLinks.js";

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
});

registerSignalHandlers(renderer);

const initialStack = resolveDeepLink({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});

const root = createRoot(renderer);

function App() {
  const [navResetKey, setNavResetKey] = useState(0);
  const screenRef = useRef<string>(initialStack[initialStack.length - 1].screen);
  const noColor = process.env.NO_COLOR === "1" || process.env.TERM === "dumb";

  const handleReset = useCallback(() => {
    setNavResetKey((k) => k + 1);
  }, []);

  const handleQuit = useCallback(() => {
    process.exit(0);
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
        <NavigationProvider
          key={navResetKey}
          initialStack={initialStack}
          onNavigate={(entry) => {
            screenRef.current = entry.screen;
          }}
        >
          <GlobalKeybindings>
            <AppShell>
              <ErrorBoundary
                onReset={handleReset}
                onQuit={handleQuit}
                currentScreen={screenRef.current}
                noColor={noColor}
              >
                <SSEProvider>
                  <ScreenRouter />
                </SSEProvider>
              </ErrorBoundary>
            </AppShell>
          </GlobalKeybindings>
        </NavigationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

root.render(<App />);

if (launchOptions.debug) {
  const { width, height } = renderer;
  process.stderr.write(
    JSON.stringify({
      component: "tui",
      phase: "bootstrap",
      level: "info",
      message: "TUI bootstrap started",
      terminal_width: width,
      terminal_height: height,
    }) + "\n"
  );
}
