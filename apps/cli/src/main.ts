#!/usr/bin/env bun
import { Cli } from "incur";
import { auth } from "./commands/auth.js";
import { repo } from "./commands/repo.js";
import { issue } from "./commands/issue.js";
import { land } from "./commands/land.js";
import { change } from "./commands/change.js";
import { bookmark } from "./commands/bookmark.js";
import { workflow, run } from "./commands/workflow.js";
import { workspace } from "./commands/workspace.js";
import { search } from "./commands/search.js";
import { label } from "./commands/label.js";
import { secret } from "./commands/secret.js";
import { variable } from "./commands/variable.js";
import { sshKey } from "./commands/ssh-key.js";
import { config } from "./commands/config.js";
import { status } from "./commands/status.js";
import { completion } from "./commands/completion.js";
import { agent } from "./commands/agent.js";
import { beta, waitlist, whitelist } from "./commands/alpha.js";
import { org } from "./commands/org.js";
import { wiki } from "./commands/wiki.js";
import { apiCmd } from "./commands/api.js";
import { notification } from "./commands/notification.js";
import { webhook } from "./commands/webhook.js";
import { admin } from "./commands/admin.js";
import { artifact } from "./commands/artifact.js";
import { cache } from "./commands/cache.js";
import { extension } from "./commands/extension.js";
import { release } from "./commands/release.js";
import { serve } from "./commands/serve.js";
import { daemon } from "./commands/daemon.js";
import { health } from "./commands/health.js";
import { tui } from "./commands/tui.js";

const ROOT_FLAGS_WITH_VALUES = new Set([
  "--filter-output",
  "--format",
  "--token-limit",
  "--token-offset",
]);

const ROOT_TERMINAL_FLAGS = new Set([
  "--help",
  "--llms",
  "--llms-full",
  "--mcp",
  "--schema",
  "--version",
]);

function findFirstCommandIndex(argv: string[]): number | null {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--") {
      return null;
    }
    if (ROOT_FLAGS_WITH_VALUES.has(token)) {
      index += 1;
      continue;
    }
    if (
      token.startsWith("--filter-output=") ||
      token.startsWith("--format=") ||
      token.startsWith("--token-limit=") ||
      token.startsWith("--token-offset=")
    ) {
      continue;
    }
    if (token.startsWith("-")) {
      continue;
    }
    return index;
  }

  return null;
}

function shouldDefaultToAgent(argv: string[]): boolean {
  if (argv.length === 0) {
    return true;
  }

  for (const token of argv) {
    if (ROOT_TERMINAL_FLAGS.has(token)) {
      return false;
    }
  }

  return findFirstCommandIndex(argv) === null;
}

function rewriteAgentArgv(argv: string[]): string[] {
  const agentIndex = argv.indexOf("agent");
  if (agentIndex === -1) {
    return argv;
  }

  const reserved = new Set(["ask", "session", "list", "view", "run", "chat"]);
  const flagsWithValues = new Set([
    "--filter-output",
    "--format",
    "--repo",
    "--token-limit",
    "--token-offset",
    "-R",
  ]);
  let firstNonOption: string | undefined;

  for (let index = agentIndex + 1; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--") {
      break;
    }
    if (flagsWithValues.has(token)) {
      index += 1;
      continue;
    }
    if (
      token.startsWith("--filter-output=") ||
      token.startsWith("--format=") ||
      token.startsWith("--repo=") ||
      token.startsWith("--token-limit=") ||
      token.startsWith("--token-offset=") ||
      token === "--sandbox"
    ) {
      continue;
    }
    if (!token.startsWith("-")) {
      firstNonOption = token;
      break;
    }
  }

  if (firstNonOption && reserved.has(firstNonOption)) {
    return argv;
  }

  return [...argv.slice(0, agentIndex + 1), "ask", ...argv.slice(agentIndex + 1)];
}

function rewriteKnownAliases(argv: string[]): string[] {
  return argv.map((token) => {
    if (token === "-R") {
      return "--repo";
    }
    if (token === "--change-id") {
      return "--change";
    }
    if (token.startsWith("--change-id=")) {
      return `--change=${token.slice("--change-id=".length)}`;
    }
    return token;
  });
}

function rewriteExplicitToonFlag(argv: string[]): string[] {
  const rewritten: string[] = [];
  for (const token of argv) {
    if (token === "--toon") {
      rewritten.push("--format", "toon");
      continue;
    }
    rewritten.push(token);
  }
  return rewritten;
}

function isJsonFieldSelectionToken(token: string): boolean {
  return token.includes(",") || token.includes(".") || token.includes("[");
}

function isTerminalJsonFieldSelectionToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);
}

function isLikelyPositionalArgumentToken(token: string): boolean {
  return /^\d+$/.test(token) || token.includes("/") || token.includes(":");
}

function rewriteJsonFieldSelection(argv: string[]): string[] {
  const rewritten: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    rewritten.push(token);

    if (token !== "--json") {
      continue;
    }

    const next = argv[index + 1];
    const following = argv[index + 2];
    if (
      next &&
      !next.startsWith("-") &&
      (
        isJsonFieldSelectionToken(next) ||
        (
          isTerminalJsonFieldSelectionToken(next) &&
          (
            following === undefined ||
            following.startsWith("-") ||
            isLikelyPositionalArgumentToken(following)
          )
        )
      )
    ) {
      rewritten.push("--filter-output", next);
      index += 1;
    }
  }

  return rewritten;
}

function rewriteRepoCloneArgv(argv: string[]): string[] {
  const firstCommandIndex = findFirstCommandIndex(argv);
  if (
    firstCommandIndex === null ||
    argv[firstCommandIndex] !== "repo" ||
    argv[firstCommandIndex + 1] !== "clone"
  ) {
    return argv;
  }

  const before = argv.slice(0, firstCommandIndex + 2);
  const after = argv.slice(firstCommandIndex + 2);
  const separatorIndex = after.indexOf("--");
  const core = separatorIndex === -1 ? after : after.slice(0, separatorIndex);
  const passthrough = separatorIndex === -1 ? [] : after.slice(separatorIndex + 1);
  const rewritten: string[] = [];
  const flagsWithValues = new Set(["--clone-arg", "--directory", "--protocol"]);
  let repoSeen = false;
  let directorySeen = false;

  for (let index = 0; index < core.length; index += 1) {
    const token = core[index]!;
    if (
      flagsWithValues.has(token) ||
      token.startsWith("--clone-arg=") ||
      token.startsWith("--directory=") ||
      token.startsWith("--protocol=")
    ) {
      rewritten.push(token);
      if (flagsWithValues.has(token) && core[index + 1] !== undefined) {
        rewritten.push(core[index + 1]!);
        index += 1;
      }
      continue;
    }

    if (token.startsWith("-")) {
      rewritten.push(token);
      continue;
    }

    if (!repoSeen) {
      repoSeen = true;
      rewritten.push(token);
      continue;
    }

    if (!directorySeen) {
      directorySeen = true;
      rewritten.push("--directory", token);
      continue;
    }

    rewritten.push(token);
  }

  for (const token of passthrough) {
    rewritten.push("--clone-arg", token);
  }

  return [...before, ...rewritten];
}

function rewriteCliArgv(argv: string[]): string[] {
  const withAliases = rewriteKnownAliases(argv);
  const withToon = rewriteExplicitToonFlag(withAliases);
  const withJsonFieldSelection = rewriteJsonFieldSelection(withToon);
  const withRepoCloneRewrite = rewriteRepoCloneArgv(withJsonFieldSelection);
  const withDefaultAgent = shouldDefaultToAgent(withRepoCloneRewrite)
    ? [...withRepoCloneRewrite, "agent", "ask"]
    : withRepoCloneRewrite;
  return rewriteAgentArgv(withDefaultAgent);
}

const cli = Cli.create("codeplane", {
  description: "Codeplane CLI — jj-native code hosting",
  version: "0.1.0",
})
  .command(auth)
  .command(repo)
  .command(issue)
  .command(land)
  .command(change)
  .command(bookmark)
  .command(release)
  .command(artifact)
  .command(cache)
  .command(workflow)
  .command(run)
  .command(workspace)
  .command(search)
  .command(label)
  .command(secret)
  .command(variable)
  .command(sshKey)
  .command(config)
  .command(status)
  .command(completion)
  .command(agent)
  .command(org)
  .command(wiki)
  .command(notification)
  .command(webhook)
  .command(admin)
  .command(extension)
  .command(beta.command(waitlist).command(whitelist))
  .command(apiCmd)
  .command(serve)
  .command(daemon)
  .command(health)
  .command(tui);

const outputBuffer: string[] = [];
let exitCode = 0;

await cli.serve(rewriteCliArgv(process.argv.slice(2)), {
  exit(code) {
    exitCode = code;
  },
  stdout(text) {
    if (process.stdout.isTTY !== true) {
      outputBuffer.push(text);
      return;
    }
    process.stdout.write(text);
  },
});

if (process.stdout.isTTY !== true && outputBuffer.length > 0) {
  const rendered = outputBuffer.join("");
  if (exitCode === 0) {
    process.stdout.write(rendered);
  } else {
    process.stderr.write(rendered);
  }
}

if (exitCode !== 0) {
  process.exit(exitCode);
}
