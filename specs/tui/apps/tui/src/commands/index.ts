import type { CommandContext, PaletteCommand } from "./types.js";
import { createAgentCommands } from "./agentCommands.js";

export type { CommandContext, PaletteCommand };
export { createAgentCommands };

/**
 * Builds the full command palette entry list by collecting commands
 * from all feature modules.
 *
 * New feature modules should add their createXxxCommands() call here.
 */
export function buildCommandRegistry(context: CommandContext): PaletteCommand[] {
  return [
    // Agent commands — added by tui-agent-screen-registry
    ...createAgentCommands(context),
    // ... other command groups will be added by subsequent tickets ...
  ];
}
