/**
 * Import verification — proves the dependency chain resolves.
 */
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions, useOnResize, useTimeline, useRenderer } from "@opentui/react";

import type { CliRenderer } from "@opentui/core";
import type { Root } from "@opentui/react";

type _AssertRendererReturn = ReturnType<typeof createCliRenderer> extends Promise<CliRenderer> ? true : never;
type _AssertRootReturn = ReturnType<typeof createRoot> extends Root ? true : never;

type _AssertUseKeyboard = typeof useKeyboard extends (...args: any[]) => any ? true : never;
type _AssertUseTerminalDimensions = typeof useTerminalDimensions extends (...args: any[]) => any ? true : never;
type _AssertUseOnResize = typeof useOnResize extends (...args: any[]) => any ? true : never;
type _AssertUseTimeline = typeof useTimeline extends (...args: any[]) => any ? true : never;
type _AssertUseRenderer = typeof useRenderer extends (...args: any[]) => any ? true : never;

void createCliRenderer;
void createRoot;
void useKeyboard;
void useTerminalDimensions;
void useOnResize;
void useTimeline;
void useRenderer;

export type { CliRenderer, Root };
