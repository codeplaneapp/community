import { execFileSync } from "node:child_process";
import { requireJj } from "./client.js";
import type { LocalStatusSummary, StatusFileSummary } from "./output.js";

export interface LocalBookmark {
  name: string;
  target_change_id: string | null;
  target_commit_id?: string | null;
}

export interface LocalChangeSummary {
  change_id: string;
  description: string;
}

interface LocalRevisionSummary {
  change_id: string;
  commit_id: string;
  description: string;
}

function runJj(args: string[]): string {
  requireJj();
  try {
    return execFileSync("jj", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trimEnd();
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "").trim()
        : "";
    if (stderr) {
      throw new Error(stderr);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

function escapeJjStringLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function parseBookmarkLine(line: string): LocalBookmark {
  const separator = line.indexOf(":");
  if (separator === -1) {
    return { name: line.trim(), target_change_id: null };
  }
  const name = line.slice(0, separator).trim();
  const rest = line.slice(separator + 1).trim();
  if (!rest) {
    return { name, target_change_id: null };
  }
  const tokens = rest.split(/\s+/);
  return {
    name,
    target_change_id: tokens[0] ?? null,
    target_commit_id: tokens[1] ?? null,
  };
}

export async function listLocalBookmarks(names: string[] = []): Promise<LocalBookmark[]> {
  const args = ["bookmark", "list", ...names];
  const output = runJj(args);
  if (!output || output.toLowerCase().includes("no bookmarks")) {
    return [];
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseBookmarkLine);
}

export async function createLocalBookmark(
  name: string,
  changeId?: string,
): Promise<LocalBookmark> {
  const args = ["bookmark", "create", name];
  if (changeId) {
    args.push("-r", changeId);
  }
  runJj(args);
  const bookmarks = await listLocalBookmarks([name]);
  return bookmarks[0] ?? { name, target_change_id: changeId ?? null };
}

export async function deleteLocalBookmark(name: string): Promise<void> {
  runJj(["bookmark", "delete", name]);
}

export async function hasLocalBookmark(name: string): Promise<boolean> {
  return (await listLocalBookmarks([name])).some((bookmark) => bookmark.name === name);
}

export async function listLocalChanges(limit = 10): Promise<LocalChangeSummary[]> {
  const output = runJj([
    "log",
    "-n",
    String(limit),
    "--no-graph",
    "-T",
    'change_id ++ "\\t" ++ description.first_line() ++ "\\n"',
  ]);
  if (!output) {
    return [];
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [changeId, ...descriptionParts] = line.split("\t");
      return {
        change_id: changeId ?? "",
        description: descriptionParts.join("\t"),
      };
    });
}

function parseRevisionLine(line: string): LocalRevisionSummary {
  const [changeId = "", commitId = "", ...descriptionParts] = line.split("\t");
  return {
    change_id: changeId,
    commit_id: commitId,
    description: descriptionParts.join("\t"),
  };
}

async function getLocalRevision(revset: string): Promise<LocalRevisionSummary> {
  const output = runJj([
    "log",
    "-r",
    revset,
    "--no-graph",
    "-T",
    'change_id ++ "\\t" ++ commit_id ++ "\\t" ++ description.first_line() ++ "\\n"',
  ]);
  const line = output.split("\n").map((entry) => entry.trim()).find(Boolean);
  if (!line) {
    throw new Error(`Unable to resolve revision ${revset}`);
  }
  return parseRevisionLine(line);
}

export async function currentLocalChangeId(): Promise<string> {
  return (await getLocalRevision("@")).change_id;
}

export async function listLocalStackChangeIds(targetBookmark: string): Promise<string[]> {
  const targetRevset = `present(bookmarks(exact:"${escapeJjStringLiteral(targetBookmark)}"))`;
  const revset = `(::@ ~ ::${targetRevset}) ~ empty()`;
  const output = runJj([
    "log",
    "-r",
    revset,
    "--no-graph",
    "-T",
    'change_id ++ "\\n"',
  ]);
  if (!output) {
    return [];
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function getLocalChange(changeId: string): Promise<string> {
  return runJj(["log", "-r", changeId, "--no-graph"]);
}

export async function getLocalChangeDetails(changeId: string): Promise<LocalRevisionSummary> {
  return getLocalRevision(changeId);
}

export async function getLocalDiff(changeId: string): Promise<string> {
  return runJj(["diff", "-r", changeId]);
}

export async function listLocalChangeFiles(changeId: string): Promise<string[]> {
  const output = runJj(["diff", "--summary", "-r", changeId]);
  if (!output) {
    return [];
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDiffSummaryLine)
    .filter((entry): entry is DiffSummaryEntry => entry !== null)
    .map((entry) => entry.path);
}

export async function listLocalChangeConflicts(changeId: string): Promise<string[]> {
  const output = runJj(["diff", "--summary", "-r", changeId]);
  if (!output) {
    return [];
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDiffSummaryLine)
    .filter((entry): entry is DiffSummaryEntry => entry !== null)
    .filter((entry) => entry.status.toUpperCase().includes("C"))
    .map((entry) => entry.path);
}

export async function getLocalStatus(): Promise<LocalStatusSummary> {
  const workingCopy = await getLocalRevision("@");
  const parent = await getLocalRevision("@-");
  const files = listDiffSummaryEntries(runJj(["diff", "--summary"]));
  return {
    working_copy: workingCopy,
    parent,
    files,
  };
}

interface DiffSummaryEntry {
  status: string;
  path: string;
}

function parseDiffSummaryLine(line: string): DiffSummaryEntry | null {
  const match = line.match(/^([A-Z!?~]+)\s+(.*)$/);
  if (!match) {
    return null;
  }
  return {
    status: match[1]!,
    path: match[2]!.trim(),
  };
}

function listDiffSummaryEntries(output: string): StatusFileSummary[] {
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDiffSummaryLine)
    .filter((entry): entry is DiffSummaryEntry => entry !== null)
    .map((entry) => ({ status: entry.status, path: entry.path }));
}
