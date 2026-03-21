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
import React from "react";

import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { AuthProvider } from "./providers/AuthProvider.js";
import { APIClientProvider } from "./providers/APIClientProvider.js";
import { ThemeProvider } from "./providers/ThemeProvider.js";
import { NavigationProvider } from "./providers/NavigationProvider.js";
import { SSEProvider } from "./providers/SSEProvider.js";
import { LoadingProvider } from "./providers/LoadingProvider.js";
import { AppShell } from "./components/AppShell.js";
import { KeybindingProvider } from "./providers/KeybindingProvider.js";
import { GlobalKeybindings } from "./components/GlobalKeybindings.js";
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

// In TUI apps, APIClientProvider internally consumes useAuth or expects baseUrl and token props. 
// We will wrap SSEProvider and everything else with it.
// Assuming APIClientProvider can pick up from AuthProvider if properly wired or just needs to be nested.
root.render(
  <ErrorBoundary>
    <ThemeProvider>
      <KeybindingProvider>
        <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
          <APIClientProvider>
            <SSEProvider>
              <NavigationProvider initialStack={initialStack}>
                <LoadingProvider>
                  <GlobalKeybindings>
                    <AppShell />
                  </GlobalKeybindings>
                </LoadingProvider>
              </NavigationProvider>
            </SSEProvider>
          </APIClientProvider>
        </AuthProvider>
      </KeybindingProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

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