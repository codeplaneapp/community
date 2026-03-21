import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheDir } from "../config.js";
import type { DocsCorpusStatus } from "./types.js";

const DEFAULT_DOCS_URL = "https://docs.jjhub.tech/llms-full.txt";

interface DocsCacheMetadata {
  etag?: string;
  lastModified?: string;
  fetchedAt: string;
  url: string;
}

export interface DocsCachePaths {
  dir: string;
  body: string;
  metadata: string;
}

export interface DocsCacheEntry {
  text: string | null;
  status: DocsCorpusStatus;
  paths: DocsCachePaths;
}

export interface RefreshDocsCacheOptions {
  cacheDirectory?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  url?: string;
}

function getDocsUrl(override?: string): string {
  return override ?? process.env.JJHUB_AGENT_DOCS_URL ?? DEFAULT_DOCS_URL;
}

export function getDocsCachePaths(cacheDirectory?: string): DocsCachePaths {
  const dir = cacheDirectory ?? join(cacheDir(), "agent", "docs");
  return {
    dir,
    body: join(dir, "llms-full.txt"),
    metadata: join(dir, "llms-full.json"),
  };
}

async function readMaybe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function loadCachedMetadata(paths: DocsCachePaths): Promise<DocsCacheMetadata | null> {
  const raw = await readMaybe(paths.metadata);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as DocsCacheMetadata;
  } catch {
    return null;
  }
}

export async function loadCachedDocs(cacheDirectory?: string): Promise<DocsCacheEntry> {
  const paths = getDocsCachePaths(cacheDirectory);
  const [text, metadata] = await Promise.all([
    readMaybe(paths.body),
    loadCachedMetadata(paths),
  ]);

  if (!text || !metadata) {
    return {
      text: null,
      paths,
      status: {
        url: getDocsUrl(),
        status: "unavailable",
        source: "none",
        warning: "No JJHub docs cache is available yet.",
      },
    };
  }

  return {
    text,
    paths,
    status: {
      url: metadata.url,
      status: "stale",
      source: "cache",
      fetchedAt: metadata.fetchedAt,
      etag: metadata.etag,
      lastModified: metadata.lastModified,
      warning: "Using cached JJHub docs.",
    },
  };
}

export async function refreshDocsCache(
  options: RefreshDocsCacheOptions = {},
): Promise<DocsCacheEntry> {
  const paths = getDocsCachePaths(options.cacheDirectory);
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = getDocsUrl(options.url);
  const cached = await loadCachedDocs(options.cacheDirectory);
  const cachedMetadata = await loadCachedMetadata(paths);

  const headers = new Headers();
  if (cachedMetadata?.etag) {
    headers.set("If-None-Match", cachedMetadata.etag);
  }
  if (cachedMetadata?.lastModified) {
    headers.set("If-Modified-Since", cachedMetadata.lastModified);
  }

  try {
    const response = await fetchImpl(url, {
      headers,
      signal: options.signal,
    });

    if (response.status === 304 && cached.text) {
      return {
        ...cached,
        status: {
          ...cached.status,
          url,
          status: "fresh",
          source: "cache",
          warning: undefined,
        },
      };
    }

    if (!response.ok) {
      throw new Error(`Docs download failed with status ${response.status}`);
    }

    const text = await response.text();
    const metadata: DocsCacheMetadata = {
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      fetchedAt: new Date().toISOString(),
      url,
    };

    await mkdir(paths.dir, { recursive: true });
    await Promise.all([
      writeFile(paths.body, text, "utf8"),
      writeFile(paths.metadata, JSON.stringify(metadata, null, 2), "utf8"),
    ]);

    return {
      text,
      paths,
      status: {
        url,
        status: "fresh",
        source: "network",
        fetchedAt: metadata.fetchedAt,
        etag: metadata.etag,
        lastModified: metadata.lastModified,
      },
    };
  } catch (error) {
    if (cached.text) {
      return {
        ...cached,
        status: {
          ...cached.status,
          url,
          status: "stale",
          source: "cache",
          warning:
            error instanceof Error
              ? `Using cached JJHub docs because refresh failed: ${error.message}`
              : "Using cached JJHub docs because refresh failed.",
        },
      };
    }

    return {
      text: null,
      paths,
      status: {
        url,
        status: "unavailable",
        source: "none",
        warning:
          error instanceof Error
            ? `JJHub docs are unavailable: ${error.message}`
            : "JJHub docs are unavailable.",
      },
    };
  }
}
