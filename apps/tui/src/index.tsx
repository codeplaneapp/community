#!/usr/bin/env bun
/**
 * Codeplane TUI — Entry point
 */

import { assertTTY, parseCLIArgs } from "./lib/terminal.js";

assertTTY();
const launchOptions = parseCLIArgs(process.argv.slice(2));

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React, { useState, useCallback, useRef } from "react";

import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ThemeProvider } from "./providers/ThemeProvider.js";
import { KeybindingProvider } from "./providers/KeybindingProvider.js";
import { OverlayManager } from "./providers/OverlayManager.js";
import { AuthProvider } from "./providers/AuthProvider.js";
import { APIClientProvider } from "./providers/APIClientProvider.js";
import { SSEProvider } from "./providers/SSEProvider.js";
import { NavigationProvider } from "./providers/NavigationProvider.js";
import { LoadingProvider } from "./providers/LoadingProvider.js";
import { GlobalKeybindings } from "./components/GlobalKeybindings.js";
import { AppShell } from "./components/AppShell.js";
import { ScreenRouter } from "./router/ScreenRouter.js";
import { registerSignalHandlers } from "./lib/signals.js";
import { buildInitialStack } from "./navigation/deepLinks.js";

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
});

registerSignalHandlers(renderer);

const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});
const initialStack = deepLinkResult.stack;

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
    <ErrorBoundary
      onReset={handleReset}
      onQuit={handleQuit}
      currentScreen={screenRef.current}
      noColor={noColor}
    >
      <ThemeProvider>
        <KeybindingProvider>
          <OverlayManager>
            <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
              <APIClientProvider>
                <SSEProvider>
                  <NavigationProvider
                    key={navResetKey}
                    initialStack={initialStack}
                  >
                    <LoadingProvider>
                      <GlobalKeybindings>
                        <AppShell>
                          <ScreenRouter />
                        </AppShell>
                      </GlobalKeybindings>
                    </LoadingProvider>
                  </NavigationProvider>
                </SSEProvider>
              </APIClientProvider>
            </AuthProvider>
          </OverlayManager>
        </KeybindingProvider>
      </ThemeProvider>
    </ErrorBoundary>
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
