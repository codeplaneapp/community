import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DocsCacheEntry } from "./docs-cache.js";

const MAX_CHUNK_CHARS = 1_500;
const DEFAULT_RESULTS = 4;

export interface DocsChunk {
  id: string;
  title: string;
  lineStart: number;
  lineEnd: number;
  text: string;
}

export interface DocsIndex {
  sourceHash: string;
  builtAt: string;
  chunks: DocsChunk[];
}

export interface DocsSearchResult {
  id: string;
  title: string;
  lineStart: number;
  lineEnd: number;
  score: number;
  snippet: string;
}

function createSourceHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function getIndexPath(cacheEntry: DocsCacheEntry): string {
  return join(cacheEntry.paths.dir, "llms-full.index.json");
}

function isHeading(line: string): { level: number; title: string } | null {
  const match = line.match(/^(#{1,6})\s+(.*)$/);
  if (!match) return null;
  return {
    level: match[1]!.length,
    title: match[2]!.trim(),
  };
}

function createChunks(text: string): DocsChunk[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: DocsChunk[] = [];
  const headingStack: string[] = [];

  let sectionTitle = "Codeplane Docs";
  let buffer: string[] = [];
  let chunkStart = 1;
  let chunkIndex = 0;

  const flush = (lineEnd: number) => {
    const joined = buffer.join("\n").trim();
    if (!joined) {
      buffer = [];
      chunkStart = lineEnd + 1;
      return;
    }

    if (joined.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        id: `${chunkIndex++}`,
        title: sectionTitle,
        lineStart: chunkStart,
        lineEnd,
        text: joined,
      });
      buffer = [];
      chunkStart = lineEnd + 1;
      return;
    }

    const sectionLines = joined.split("\n");
    let partBuffer: string[] = [];
    let partStart = chunkStart;
    let currentLine = chunkStart;

    for (const line of sectionLines) {
      const projected = [...partBuffer, line].join("\n");
      if (partBuffer.length > 0 && projected.length > MAX_CHUNK_CHARS) {
        chunks.push({
          id: `${chunkIndex++}`,
          title: sectionTitle,
          lineStart: partStart,
          lineEnd: currentLine - 1,
          text: partBuffer.join("\n"),
        });
        partBuffer = [line];
        partStart = currentLine;
      } else {
        partBuffer.push(line);
      }
      currentLine += 1;
    }

    if (partBuffer.length > 0) {
      chunks.push({
        id: `${chunkIndex++}`,
        title: sectionTitle,
        lineStart: partStart,
        lineEnd,
        text: partBuffer.join("\n"),
      });
    }

    buffer = [];
    chunkStart = lineEnd + 1;
  };

  lines.forEach((line, index) => {
    const heading = isHeading(line);
    if (heading) {
      flush(index);
      headingStack.splice(heading.level - 1);
      headingStack[heading.level - 1] = heading.title;
      sectionTitle = headingStack.filter(Boolean).join(" > ") || "Codeplane Docs";
      chunkStart = index + 1;
      return;
    }

    buffer.push(line);
  });

  flush(lines.length);

  if (chunks.length > 0) {
    return chunks;
  }

  return [
    {
      id: "0",
      title: "Codeplane Docs",
      lineStart: 1,
      lineEnd: lines.length,
      text: text.trim(),
    },
  ];
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let index = 0;
  let count = 0;
  while (true) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

function buildSnippet(text: string, queryTokens: string[]): string {
  const lines = text.split("\n");
  const lowerText = text.toLowerCase();
  let firstMatch = 0;

  for (const token of queryTokens) {
    const index = lowerText.indexOf(token);
    if (index >= 0) {
      firstMatch = index;
      break;
    }
  }

  if (firstMatch === 0) {
    return lines.slice(0, 12).join("\n");
  }

  const prefix = text.slice(0, firstMatch);
  const startLine = prefix.split("\n").length - 1;
  return lines.slice(Math.max(0, startLine - 2), startLine + 10).join("\n");
}

export function buildDocsIndex(text: string): DocsIndex {
  return {
    sourceHash: createSourceHash(text),
    builtAt: new Date().toISOString(),
    chunks: createChunks(text),
  };
}

export async function prepareDocsIndex(
  cacheEntry: DocsCacheEntry,
): Promise<DocsIndex | null> {
  if (!cacheEntry.text) {
    return null;
  }

  const sourceHash = createSourceHash(cacheEntry.text);
  const indexPath = getIndexPath(cacheEntry);

  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as DocsIndex;
    if (parsed.sourceHash === sourceHash && Array.isArray(parsed.chunks)) {
      return parsed;
    }
  } catch {
    // Ignore missing or invalid index files and rebuild below.
  }

  const index = buildDocsIndex(cacheEntry.text);
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  return index;
}

export function searchDocsIndex(
  index: DocsIndex,
  query: string,
  maxResults = DEFAULT_RESULTS,
): DocsSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const tokens = Array.from(
    new Set(
      normalizedQuery
        .split(/[^a-z0-9_./:-]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );

  const scored = index.chunks
    .map((chunk) => {
      const haystack = chunk.text.toLowerCase();
      const title = chunk.title.toLowerCase();

      let score = 0;
      if (title.includes(normalizedQuery)) score += 12;
      if (haystack.includes(normalizedQuery)) score += 8;

      for (const token of tokens) {
        score += countOccurrences(title, token) * 5;
        score += countOccurrences(haystack, token);
      }

      return { chunk, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults)
    .map(({ chunk, score }) => ({
      id: chunk.id,
      title: chunk.title,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      score,
      snippet: buildSnippet(chunk.text, tokens),
    }));

  return scored;
}
