import { ScreenName } from "../router/index.js";
import type { CommandContext, PaletteCommand } from "./types.js";

/**
 * Returns command palette entries for agent screen navigation.
 *
 * Both commands require repo context. The "New Agent Session" command
 * additionally requires write access — it is invisible (not grayed out)
 * to read-only users and guests.
 */
export function createAgentCommands(context: CommandContext): PaletteCommand[] {
  return [
    {
      id: "navigate-agents",
      name: "Agent Sessions",
      aliases: [":agents", "agents"],
      description: "Go to the agent sessions list for this repository",
      category: "Navigate",
      keybinding: "g a",
      priority: 40,
      contextRequirements: { repo: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return;
        context.navigate(ScreenName.Agents, { owner: repo.owner, repo: repo.repo });
      },
    },

    {
      id: "create-agent-session",
      name: "New Agent Session",
      aliases: ["Create Agent Session", "new agent", "create agent"],
      description: "Start a new agent session in this repository",
      category: "Action",
      priority: 41,
      contextRequirements: { repo: true, writeAccess: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return;
        context.navigate(ScreenName.AgentSessionCreate, {
          owner: repo.owner,
          repo: repo.repo,
        });
      },
    },
  ];
}
