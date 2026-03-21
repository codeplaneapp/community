import {
  createBashTool,
  createEditTool,
  createFindTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@mariozechner/pi-coding-agent";
import type { AgentExecutionBackend, RepoContext } from "../types.js";

export function createLocalBackend(repoContext: RepoContext): AgentExecutionBackend {
  const cwd = repoContext.repoRoot ?? repoContext.cwd;

  return {
    kind: "local",
    displayName: "local",
    cwd,
    createPiTools() {
      return [
        createReadTool(cwd),
        createWriteTool(cwd),
        createEditTool(cwd),
        createBashTool(cwd),
        createFindTool(cwd),
        createLsTool(cwd),
      ];
    },
    describeContext() {
      return {
        backend: "local",
        cwd,
      };
    },
    async dispose() {
      // No local resources to clean up.
    },
  };
}
