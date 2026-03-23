/**
 * Codeplane TUI — Entry point
 *
 * Planned bootstrap sequence:
 *   1. Terminal setup
 *   2. Auth token resolution
 *   3. Renderer init
 *   4. Provider stack mount
 *   5. Token validation
 *   6. SSE connection
 *   7. Initial screen render
 */

import type { CliRenderer } from "@opentui/core";
import type { Root } from "@opentui/react";

export type { CliRenderer, Root };
