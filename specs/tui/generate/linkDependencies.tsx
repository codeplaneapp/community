/** @jsxImportSource smithers-orchestrator */
import { Task, Sequence } from "smithers-orchestrator";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { specsDir } from "./utils";

export const linkDependenciesSchemas = {
  linkResult: z.object({
    totalTickets: z.number(),
    refsFixed: z.number(),
    refsDropped: z.number(),
    fixes: z.array(z.object({
      ticket: z.string(),
      from: z.string(),
      to: z.string().describe("Resolved ID, or empty string if dropped"),
    })),
  }),
};

/**
 * Deterministic dependency linker.
 *
 * Runs after all ticket JSONs are written. Loads every ticket from every group,
 * builds a master ID set, then for each dependency reference that doesn't
 * resolve:
 *   1. Tries exact prefix/suffix matching (e.g. "tui-auth-loading" -> "tui-auth-token-loading")
 *   2. Tries Levenshtein-based fuzzy match (threshold: edit distance <= 30% of length)
 *   3. Drops the dep if no match is found
 *
 * Rewrites ticket JSON files in-place with corrected dependencies.
 */
export function LinkDependenciesPhase({
  ctx,
  featureGroups,
  outputs,
}: {
  ctx: any;
  featureGroups: any[];
  outputs: any;
}) {
  const dir = specsDir();
  const allTicketsDone = ctx.outputMaybe(outputs.allTicketsDone, { nodeId: "all-tickets-done" });
  if (!allTicketsDone || featureGroups.length === 0) return null;

  return (
    <Task id="link-dependencies" output={outputs.linkResult}>
      {async () => {
        // 1. Load all tickets from all groups
        const byGroup: Map<string, any[]> = new Map();
        const allTickets: Map<string, any> = new Map();

        for (const g of featureGroups) {
          const p = path.join(dir, `tickets-${g.id}.json`);
          try {
            const raw = await fs.readFile(p, "utf-8");
            const tickets = JSON.parse(raw);
            byGroup.set(g.id, tickets);
            for (const t of tickets) {
              allTickets.set(t.id, t);
            }
          } catch {
            byGroup.set(g.id, []);
          }
        }

        const validIds = new Set(allTickets.keys());
        const fixes: Array<{ ticket: string; from: string; to: string }> = [];
        let refsFixed = 0;
        let refsDropped = 0;

        // 2. Resolve each broken dependency
        for (const [tid, ticket] of allTickets) {
          const deps: string[] = ticket.dependencies || [];
          const resolved: string[] = [];

          for (const dep of deps) {
            if (validIds.has(dep)) {
              resolved.push(dep);
              continue;
            }

            const match = findBestMatch(dep, validIds);
            if (match) {
              resolved.push(match);
              fixes.push({ ticket: tid, from: dep, to: match });
              refsFixed++;
            } else {
              fixes.push({ ticket: tid, from: dep, to: "" });
              refsDropped++;
            }
          }

          ticket.dependencies = resolved;
        }

        // 3. Validate no circular deps were introduced
        const cycles = detectCycles(allTickets);
        if (cycles.length > 0) {
          // Break cycles by dropping the back-edge dep
          for (const [from, to] of cycles) {
            const ticket = allTickets.get(from)!;
            ticket.dependencies = ticket.dependencies.filter((d: string) => d !== to);
            fixes.push({ ticket: from, from: to, to: "" });
            refsDropped++;
          }
        }

        // 4. Write corrected ticket JSONs back
        for (const [groupId, tickets] of byGroup) {
          const p = path.join(dir, `tickets-${groupId}.json`);
          await fs.writeFile(p, JSON.stringify(tickets, null, 2), "utf-8");
        }

        return {
          totalTickets: allTickets.size,
          refsFixed,
          refsDropped,
          fixes,
        };
      }}
    </Task>
  );
}

/** Find the best matching valid ID for a phantom dependency. */
function findBestMatch(phantom: string, validIds: Set<string>): string | null {
  const ids = Array.from(validIds);

  // Strategy 1: Exact containment — one is a substring of the other
  // e.g. "tui-auth-loading" matches "tui-auth-token-loading"
  const containmentMatches = ids.filter(
    (id) => id.includes(phantom) || phantom.includes(id)
  );
  if (containmentMatches.length === 1) return containmentMatches[0];
  if (containmentMatches.length > 1) {
    // Pick the shortest (most specific) match
    containmentMatches.sort((a, b) => a.length - b.length);
    return containmentMatches[0];
  }

  // Strategy 2: Suffix match — same ending after last meaningful segment
  // e.g. "tui-bootstrap-renderer" matches "tui-bootstrap-and-renderer"
  const phantomParts = phantom.split("-");
  const suffixTarget = phantomParts.slice(-2).join("-");
  const suffixMatches = ids.filter((id) => {
    const parts = id.split("-");
    return parts.slice(-2).join("-") === suffixTarget || parts.slice(-1)[0] === phantomParts.slice(-1)[0];
  });
  if (suffixMatches.length === 1) return suffixMatches[0];

  // Strategy 3: Levenshtein distance
  let bestDist = Infinity;
  let bestId: string | null = null;
  for (const id of ids) {
    const dist = levenshtein(phantom, id);
    const threshold = Math.ceil(Math.max(phantom.length, id.length) * 0.3);
    if (dist < bestDist && dist <= threshold) {
      bestDist = dist;
      bestId = id;
    }
  }

  return bestId;
}

/** Simple Levenshtein distance. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/** Detect cycles in the dependency graph. Returns back-edges as [from, to] pairs. */
function detectCycles(tickets: Map<string, any>): Array<[string, string]> {
  const backEdges: Array<[string, string]> = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(tid: string) {
    visited.add(tid);
    recStack.add(tid);
    const ticket = tickets.get(tid);
    if (!ticket) { recStack.delete(tid); return; }
    for (const dep of ticket.dependencies || []) {
      if (!tickets.has(dep)) continue;
      if (recStack.has(dep)) {
        backEdges.push([tid, dep]);
      } else if (!visited.has(dep)) {
        dfs(dep);
      }
    }
    recStack.delete(tid);
  }

  for (const tid of tickets.keys()) {
    if (!visited.has(tid)) dfs(tid);
  }
  return backEdges;
}
