# AGENT_CONTEXT_DOCUMENTATION_INDEX

Specification for AGENT_CONTEXT_DOCUMENTATION_INDEX.

## High-Level User POV

When you start a Codeplane agent session—whether through the CLI, TUI, web agent dock, or an editor integration—the agent automatically has access to the full Codeplane product documentation, searchable and grounded in the latest published content. You never have to copy-paste documentation or tell the agent where to find answers. It already knows.

Behind the scenes, the agent maintains a local documentation index: a searchable, chunked representation of the Codeplane product knowledge base (served as `llms-full.txt`). This index is built from the raw documentation text by splitting it into heading-aware sections, and it supports fast keyword-based search so the agent can retrieve focused excerpts rather than scanning the entire corpus. The index is cached on disk and only rebuilt when the underlying documentation content changes, so subsequent agent sessions start instantly without re-parsing.

As a user, the value is that the agent gives you accurate, documentation-backed answers about Codeplane workflows, jj integration, CLI commands, API usage, and product behavior. When you ask "how do I create a landing request?", the agent searches its local documentation index, finds the most relevant sections, and synthesizes an answer grounded in real product documentation—not hallucinated guesses. If the documentation hasn't been fetched yet, the agent tells you it's working from memory rather than silently degrading.

The documentation index also powers the `codeplane_docs_search` tool that the agent can call during a session. This tool accepts a natural-language query and returns ranked excerpts with section titles, line ranges, and text snippets. The agent uses this tool proactively whenever you ask about Codeplane-specific topics, and you can see the source sections it cited in the tool call results.

The system is designed to be transparent about its documentation state. The agent's startup context includes a documentation status block that tells you whether the docs are fresh (just fetched from the network), stale (using a cached copy because the network fetch failed), or unavailable (no cached copy exists). This transparency lets you know when the agent's answers may be less reliable and prompts you to check your network connection or docs configuration.

## Acceptance Criteria

- [ ] **AC-1**: The documentation index MUST be built by chunking the raw `llms-full.txt` content on markdown heading boundaries (levels 1–6).
- [ ] **AC-2**: Each chunk MUST contain a unique sequential ID (string), a breadcrumb-style title (heading hierarchy joined by ` > `), a `lineStart` number, a `lineEnd` number, and the chunk `text` content.
- [ ] **AC-3**: No single chunk MUST exceed 1,500 characters. Sections longer than 1,500 characters MUST be split into multiple chunks at line boundaries, all sharing the same breadcrumb title.
- [ ] **AC-4**: The index MUST include a `sourceHash` field computed as the SHA-256 hex digest of the raw documentation text.
- [ ] **AC-5**: The index MUST include a `builtAt` ISO-8601 timestamp recording when the index was constructed.
- [ ] **AC-6**: The index MUST be persisted to disk at `~/.codeplane/cache/agent/docs/llms-full.index.json`.
- [ ] **AC-7**: When loading the index, if a cached `llms-full.index.json` exists and its `sourceHash` matches the current documentation text's SHA-256 hash, the cached index MUST be reused without rebuilding.
- [ ] **AC-8**: When loading the index, if the cached index is missing, unreadable, has an invalid `sourceHash`, or has a non-array `chunks` field, the index MUST be rebuilt from scratch.
- [ ] **AC-9**: If the documentation text is `null` (unavailable), the index preparation MUST return `null` rather than producing an empty or broken index.
- [ ] **AC-10**: The search function MUST accept a `query` string and an optional `maxResults` number (default: 4, hard cap: 8).
- [ ] **AC-11**: An empty or whitespace-only query MUST return zero results.
- [ ] **AC-12**: Query tokenization MUST split on non-alphanumeric boundaries (preserving `.`, `/`, `:`, `-`, `_` within tokens), lowercase all tokens, and deduplicate them. Tokens shorter than 2 characters MUST be discarded.
- [ ] **AC-13**: Search scoring MUST use a BM25-inspired additive model: full normalized query match in title = +12 points, full normalized query match in body = +8 points, per-token occurrence in title = +5 points each, per-token occurrence in body = +1 point each.
- [ ] **AC-14**: Only chunks with a score greater than 0 MUST be returned.
- [ ] **AC-15**: Results MUST be sorted by score descending and truncated to `maxResults`.
- [ ] **AC-16**: Each search result MUST include: `id`, `title`, `lineStart`, `lineEnd`, `score` (number), and `snippet` (string).
- [ ] **AC-17**: The snippet MUST be extracted by finding the first line containing a matching token and returning up to 12 lines of context (2 lines before the match, 10 lines after). If no token matches a specific line, the first 12 lines of the chunk MUST be used.
- [ ] **AC-18**: The index MUST handle documentation text that contains no headings by producing a single chunk spanning the entire text with title `"Codeplane Docs"`.
- [ ] **AC-19**: The index MUST handle documentation text that is entirely empty (zero bytes after trimming) by producing a single chunk with empty text.
- [ ] **AC-20**: The `sourceHash` MUST change if even a single byte of the documentation text changes, triggering a full rebuild on next load.
- [ ] **AC-21**: Windows-style `\r\n` line endings in the documentation text MUST be normalized to `\n` before chunking.
- [ ] **AC-22**: The index file MUST be written with `JSON.stringify(index, null, 2)` formatting (pretty-printed, 2-space indent).
- [ ] **AC-23**: The index build process MUST be synchronous in terms of chunk computation (no async I/O during chunking), with only the file read/write operations being async.
- [ ] **AC-24**: When the `codeplane_docs_search` tool is invoked and no index is available, it MUST return a text-content response explaining that docs are unavailable, along with the current docs status.
- [ ] **AC-25**: When the `codeplane_docs_search` tool returns results from a stale cache, the response text MUST include a trailing note indicating the cache is stale with the warning reason.
- [ ] **AC-26**: The `max_results` parameter MUST be floored to an integer and capped at 8. Values ≤ 0 or non-numeric MUST fall back to the default of 4.
- [ ] **AC-27**: The documentation index MUST correctly handle heading nesting (e.g., an H3 under an H1 with no H2 yields a two-level breadcrumb, not a three-level breadcrumb with an empty middle segment).
- [ ] **AC-28**: The heading stack MUST be truncated when a same-or-higher-level heading is encountered (e.g., encountering an H2 after an H3 clears the H3 from the stack).

### Definition of Done

The feature is done when:
1. All acceptance criteria pass in automated tests.
2. The documentation index is correctly built from arbitrary markdown input with headings at all levels.
3. The index is correctly cached, validated by source hash, and rebuilt only when content changes.
4. The search function returns correctly scored, ranked, and snippeted results for a variety of queries.
5. Edge cases (empty text, no headings, single-character tokens, CRLF line endings, extremely long sections) are handled gracefully.
6. The `codeplane_docs_search` tool correctly delegates to the index and handles unavailable/stale states.
7. The index file format is stable and backward-compatible across CLI versions.

## Design

### Data Model

#### DocsChunk

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Sequential chunk identifier (e.g., `"0"`, `"1"`, `"2"`) |
| `title` | string | Breadcrumb of heading hierarchy (e.g., `"Getting Started > CLI > Auth"`) |
| `lineStart` | number | 1-based line number where the chunk starts in the original text |
| `lineEnd` | number | 1-based line number where the chunk ends in the original text |
| `text` | string | The chunk content (trimmed, max 1,500 characters) |

#### DocsIndex

| Field | Type | Description |
|-------|------|-------------|
| `sourceHash` | string | SHA-256 hex digest of the raw documentation text |
| `builtAt` | string | ISO-8601 timestamp of when the index was built |
| `chunks` | DocsChunk[] | Array of all documentation chunks |

#### DocsSearchResult

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Chunk ID that matched |
| `title` | string | Breadcrumb title of the matching chunk |
| `lineStart` | number | Start line in original docs |
| `lineEnd` | number | End line in original docs |
| `score` | number | Relevance score (higher is better) |
| `snippet` | string | Contextual excerpt from the chunk (up to 12 lines) |

### Index Build Algorithm

1. Normalize line endings: replace all `\r\n` with `\n`.
2. Split text into lines.
3. Walk lines sequentially. Maintain a heading stack (array indexed by heading level - 1).
4. When a heading line is encountered (regex: `/^(#{1,6})\s+(.*)$/`):
   a. Flush the current buffer as a chunk (or multiple chunks if >1,500 chars).
   b. Splice the heading stack at `level - 1`, set the heading title at that position.
   c. Compute the breadcrumb title by filtering non-empty entries and joining with ` > `.
   d. Reset the buffer and chunk start line.
5. When a non-heading line is encountered, append it to the current buffer.
6. After all lines are processed, flush any remaining buffer.
7. If the flush of an oversized section occurs, split at line boundaries: accumulate lines until the joined text exceeds 1,500 characters, then emit a chunk and start a new accumulation.
8. If no chunks were produced (edge case: entirely empty text), return a single chunk spanning the full text with title `"Codeplane Docs"`.

### Search Algorithm

1. Normalize the query: trim and lowercase.
2. If the normalized query is empty, return `[]`.
3. Tokenize: split on `/[^a-z0-9_./:-]+/i`, trim each token, discard tokens shorter than 2 characters, deduplicate.
4. For each chunk, compute a score:
   - If the lowercased title contains the full normalized query: `+12`
   - If the lowercased text contains the full normalized query: `+8`
   - For each unique token, add `countOccurrences(title, token) * 5`
   - For each unique token, add `countOccurrences(text, token) * 1`
5. Filter chunks with `score > 0`.
6. Sort by score descending.
7. Slice to `maxResults`.
8. For each result, build a snippet:
   - Find the first line containing any token.
   - Return lines `[max(0, matchLine - 2), matchLine + 10)`.
   - If no token matches any specific line, return the first 12 lines.

### CLI Integration

The documentation index is consumed during `codeplane agent ask` startup:

1. After `refreshDocsCache()` completes, `prepareDocsIndex(cacheEntry)` is called.
2. If a valid cached index exists, it is loaded (~instant). Otherwise the index is built from the cached text.
3. The resulting `DocsIndex` (or `null`) is passed to `createCodeplaneDocsTool()`.
4. The tool is registered as a custom tool on the Pi Coding Agent session.

No separate CLI command exposes the documentation index directly. It is an internal subsystem consumed by the agent runtime.

### Tool Shape: `codeplane_docs_search`

**Name**: `codeplane_docs_search`

**Description**: Search the locally cached Codeplane docs corpus and return focused excerpts instead of guessing.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Codeplane docs search query |
| `max_results` | number | No | Maximum number of excerpts to return (1–8, default: 4) |

**Response format**:

When results are found:
```
[1] Getting Started > CLI > Auth (lines 45-67)
<snippet text>

[2] API > Sessions (lines 120-145)
<snippet text>
```

When results are found but docs are stale:
```
[1] Getting Started > CLI > Auth (lines 45-67)
<snippet text>

[Using cached Codeplane docs: refresh failed: connect ECONNREFUSED]
```

When no results match:
```
No Codeplane docs sections matched "your query here".
```

When docs are unavailable:
```
Codeplane docs are currently unavailable, so docs-backed answers are degraded.
```

### Prompt Guidelines

The agent system prompt includes these guidelines for the documentation search tool:

- Prefer `codeplane_docs_search` before giving Codeplane-specific advice.
- Quote or summarize only the returned excerpts, not the whole Codeplane corpus.

### File System Layout

```
~/.codeplane/
└── cache/
    └── agent/
        └── docs/
            ├── llms-full.txt          # Raw documentation text
            ├── llms-full.json         # Cache metadata (etag, lastModified, fetchedAt, url)
            └── llms-full.index.json   # Built search index (sourceHash, builtAt, chunks[])
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEPLANE_AGENT_DOCS_URL` | `https://docs.codeplane.app/llms-full.txt` | URL to fetch the documentation text from |
| `CODEPLANE_AGENT_DOCS_TIMEOUT_MS` | `3000` | Maximum time in milliseconds to wait for the documentation fetch |

### Documentation

The following end-user documentation should be written:

1. **Agent Documentation Search Guide**: A page explaining that the Codeplane agent automatically has access to product documentation, how it is cached locally, and how the `codeplane_docs_search` tool works during agent sessions.
2. **Agent Configuration Reference**: A section documenting the `CODEPLANE_AGENT_DOCS_URL` and `CODEPLANE_AGENT_DOCS_TIMEOUT_MS` environment variables, explaining when users might want to override them (e.g., air-gapped environments, local documentation servers).
3. **Troubleshooting: Agent Docs Unavailable**: A troubleshooting entry explaining what "docs unavailable" or "stale docs" means, how to check network connectivity to `docs.codeplane.app`, and how to manually clear the cache at `~/.codeplane/cache/agent/docs/` to force a fresh fetch.

## Permissions & Security

### Authorization

The documentation index is a **local-only, client-side** subsystem. It does not interact with the Codeplane API server's authorization model. Any user who can run the `codeplane` CLI can build and query the documentation index.

| Role | Access |
|------|--------|
| Any CLI user | Full access to docs index build and search |
| Unauthenticated CLI user | Full access (docs fetch does not require auth) |
| Server-side | Not applicable (index is client-only) |

### Rate Limiting

- **Documentation fetch**: The docs URL (`https://docs.codeplane.app/llms-full.txt`) is a static CDN-served file. Standard CDN rate limits apply. The conditional fetch (ETag/If-Modified-Since) minimizes unnecessary bandwidth.
- **Local search**: No rate limiting is needed for local index search operations. They are CPU-bound, fast, and do not make network calls.
- **Abuse vector**: A malicious script could call `codeplane_docs_search` in a tight loop within an agent session, but this would only consume local CPU and has no server-side impact. The hard cap of 8 results per query bounds memory allocation per search call.

### Data Privacy

- The documentation text is **public product documentation**. It contains no PII, no user-specific data, and no secrets.
- The cache is stored in the user's home directory (`~/.codeplane/cache/`) with standard filesystem permissions. No special encryption or access control is required beyond normal OS-level file permissions.
- The index file (`llms-full.index.json`) contains only public documentation content and metadata. It is safe to include in backups or share across machines.
- No user queries, search results, or agent session content are stored in the index file or transmitted externally as part of the documentation index feature.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `agent_docs_index_built` | A new index is constructed from raw text | `chunk_count` (number), `source_hash` (string, first 12 chars), `build_duration_ms` (number), `text_size_bytes` (number) |
| `agent_docs_index_loaded` | A cached index is loaded without rebuild | `chunk_count` (number), `source_hash` (string, first 12 chars), `index_age_seconds` (number) |
| `agent_docs_search_invoked` | The `codeplane_docs_search` tool is called | `query_length` (number), `max_results` (number), `results_returned` (number), `top_score` (number or null), `docs_status` ("fresh" / "stale" / "unavailable"), `query_token_count` (number) |
| `agent_docs_search_empty` | Search was invoked but returned zero results | `query_length` (number), `query` (string, truncated to 200 chars), `docs_status` (string), `chunk_count` (number) |
| `agent_docs_unavailable_at_search` | Search tool was called but no index exists | `docs_status` (string), `warning` (string) |

### Funnel Metrics

1. **Docs availability rate**: Percentage of agent sessions where the docs index is available (non-null) at session start. Target: >95%.
2. **Cache hit rate**: Percentage of index loads that reuse a cached index vs. rebuilding. Target: >90% after initial fetch.
3. **Search invocation rate**: Average number of `codeplane_docs_search` calls per agent session. Indicates how often the agent proactively uses documentation.
4. **Zero-result rate**: Percentage of search invocations that return zero results. A rising zero-result rate may indicate stale or incomplete documentation coverage. Target: <15%.
5. **Stale docs rate**: Percentage of sessions where docs are in "stale" state. Target: <10% for users with network access.

## Observability

### Logging

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Index build started | `info` | `{ source_hash, text_length }` | Logged when a new index build begins |
| Index build completed | `info` | `{ source_hash, chunk_count, duration_ms }` | Logged when index build finishes |
| Index cache hit | `debug` | `{ source_hash, chunk_count, index_path }` | Logged when a cached index is loaded successfully |
| Index cache miss | `debug` | `{ source_hash, expected_hash, index_path }` | Logged when cached index hash doesn't match |
| Index cache read error | `warn` | `{ index_path, error_message }` | Logged when the cached index file cannot be read or parsed |
| Index write failed | `error` | `{ index_path, error_message }` | Logged when the built index cannot be persisted to disk |
| Search executed | `debug` | `{ query, token_count, results_returned, top_score, duration_ms }` | Logged for every search invocation |
| Search with empty query | `debug` | `{ }` | Logged when search is called with an empty/whitespace query |
| Docs unavailable at search time | `warn` | `{ docs_status, warning }` | Logged when search tool is invoked but no docs are available |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_agent_docs_index_builds_total` | Counter | `result` (success, error) | Total index build attempts |
| `codeplane_agent_docs_index_build_duration_seconds` | Histogram | — | Duration of index builds |
| `codeplane_agent_docs_index_chunks_gauge` | Gauge | — | Number of chunks in the current index |
| `codeplane_agent_docs_index_loads_total` | Counter | `source` (cache, rebuild) | Total index load attempts by source |
| `codeplane_agent_docs_search_total` | Counter | `result` (results, empty, unavailable) | Total search invocations by outcome |
| `codeplane_agent_docs_search_duration_seconds` | Histogram | — | Duration of search operations |
| `codeplane_agent_docs_search_results_count` | Histogram | — | Distribution of result counts per search |

### Alerts

#### Alert: `AgentDocsIndexBuildFailureRate`
- **Condition**: `rate(codeplane_agent_docs_index_builds_total{result="error"}[15m]) / rate(codeplane_agent_docs_index_builds_total[15m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check recent error logs for `Index write failed` entries to identify disk-related issues (permissions, disk full).
  2. Verify the `~/.codeplane/cache/agent/docs/` directory exists and is writable.
  3. Check if the raw `llms-full.txt` file is corrupted (zero bytes, truncated download).
  4. Try manually deleting `llms-full.index.json` and restarting an agent session to trigger a rebuild.
  5. If the issue persists, check for OS-level file system errors or disk quota exhaustion.

#### Alert: `AgentDocsSearchHighZeroResultRate`
- **Condition**: `rate(codeplane_agent_docs_search_total{result="empty"}[1h]) / rate(codeplane_agent_docs_search_total[1h]) > 0.3`
- **Severity**: Warning
- **Runbook**:
  1. Review recent `agent_docs_search_empty` telemetry events to identify common failing queries.
  2. Determine if the queries represent valid user needs that the documentation doesn't cover (gap in docs) or irrelevant/malformed queries.
  3. If the queries are valid, file documentation improvement issues for the missing topics.
  4. Check if the docs URL has changed or if the downloaded `llms-full.txt` is significantly smaller than expected (partial download).
  5. Verify the index chunk count is reasonable (expect hundreds of chunks for a full docs corpus).

#### Alert: `AgentDocsSearchLatencyP99`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_agent_docs_search_duration_seconds_bucket[5m])) > 0.5`
- **Severity**: Warning
- **Runbook**:
  1. Check the current index chunk count via `codeplane_agent_docs_index_chunks_gauge`. An unusually large number of chunks (>10,000) could indicate a docs parsing issue.
  2. Review the documentation text size. If `llms-full.txt` has grown significantly (>500KB), the search may need optimization.
  3. Check system resource utilization (CPU, memory). Documentation search is CPU-bound; high system load can cause latency spikes.
  4. Consider whether the MAX_CHUNK_CHARS constant (1,500) needs adjustment if chunk count has grown excessively.

#### Alert: `AgentDocsUnavailableRate`
- **Condition**: `rate(codeplane_agent_docs_search_total{result="unavailable"}[1h]) / rate(codeplane_agent_docs_search_total[1h]) > 0.2`
- **Severity**: Critical
- **Runbook**:
  1. Check if `docs.codeplane.app` is reachable. Run `curl -I https://docs.codeplane.app/llms-full.txt` from an affected machine.
  2. Check DNS resolution for `docs.codeplane.app`.
  3. Check CDN/hosting status for documentation site.
  4. If the site is down, this alert will auto-resolve once the site recovers and users refresh their caches.
  5. If users are in air-gapped environments, ensure they have configured `CODEPLANE_AGENT_DOCS_URL` to point to an internal mirror.
  6. As a temporary mitigation, users can manually place a `llms-full.txt` file at `~/.codeplane/cache/agent/docs/llms-full.txt`.

### Error Cases and Failure Modes

| Error Case | Behavior | Recoverability |
|------------|----------|----------------|
| `llms-full.txt` not yet fetched | `prepareDocsIndex` returns `null`; search tool returns unavailable message | Automatic on next agent session with network |
| `llms-full.index.json` corrupted or invalid JSON | Index is rebuilt from raw text | Automatic |
| `llms-full.index.json` has wrong `sourceHash` | Index is rebuilt from raw text | Automatic |
| `llms-full.index.json` write fails (disk full, permissions) | Index build succeeds but cache is not persisted; next session will rebuild again | Requires user action (free disk space or fix permissions) |
| Extremely large docs text (>10MB) | Index build may be slow; chunk count may be very high | Functional but degraded performance |
| Docs text with no headings | Single chunk produced spanning entire text | Functional; search still works |
| Docs text that is entirely whitespace | Single chunk produced with empty trimmed text | Functional; all searches return zero results |
| Search query with only single-character tokens | All tokens discarded; returns zero results | By design |
| Search query longer than 10,000 characters | Processed normally; no truncation | Functional but may be slow |
| Index built from different docs URL than current | Hash mismatch triggers rebuild | Automatic |

## Verification

### Integration Tests: Index Build

- [ ] **T-BUILD-1**: Building an index from a simple markdown document with H1, H2, and H3 headings produces the correct number of chunks with correct breadcrumb titles.
- [ ] **T-BUILD-2**: Building an index from a document with a section longer than 1,500 characters splits that section into multiple chunks at line boundaries.
- [ ] **T-BUILD-3**: Building an index from a document with CRLF line endings produces the same chunks as the same document with LF line endings.
- [ ] **T-BUILD-4**: Building an index from a document with no headings produces a single chunk with title `"Codeplane Docs"`.
- [ ] **T-BUILD-5**: Building an index from an empty string produces a single chunk with title `"Codeplane Docs"` and empty text.
- [ ] **T-BUILD-6**: Building an index from a document where an H3 follows an H1 (no H2) produces a two-level breadcrumb (`"H1 Title > H3 Title"`), not a three-level breadcrumb with an empty middle.
- [ ] **T-BUILD-7**: Building an index from a document where an H2 follows an H3 correctly resets the heading stack (the H3 is no longer in the breadcrumb after the H2).
- [ ] **T-BUILD-8**: Chunk IDs are sequential strings starting from `"0"`.
- [ ] **T-BUILD-9**: The `sourceHash` changes when even one character of the input text changes.
- [ ] **T-BUILD-10**: The `sourceHash` is identical for identical input text across multiple builds.
- [ ] **T-BUILD-11**: The `builtAt` field is a valid ISO-8601 timestamp.
- [ ] **T-BUILD-12**: A document with exactly 1,500 characters under a single heading produces exactly one chunk (no split).
- [ ] **T-BUILD-13**: A document with 1,501 characters under a single heading produces exactly two chunks.
- [ ] **T-BUILD-14**: A document consisting solely of heading lines (no body content) produces chunks only for headings that have body content following them. If no body content exists under any heading, the fallback single-chunk is produced.
- [ ] **T-BUILD-15**: Building an index from a document with 6 levels of heading nesting (H1 through H6) produces the full 6-level breadcrumb.
- [ ] **T-BUILD-16**: A document with consecutive headings (H2 immediately followed by H2) correctly flushes the empty buffer between them and does not produce a chunk with empty text.
- [ ] **T-BUILD-17**: Building an index from a document of exactly the maximum expected size (1 MB of markdown text) completes successfully within 5 seconds.
- [ ] **T-BUILD-18**: Building an index from a document larger than 1 MB (e.g., 5 MB) completes successfully (no hard limit on input size, just performance degradation).

### Integration Tests: Index Cache

- [ ] **T-CACHE-1**: `prepareDocsIndex` with a valid cached index file whose `sourceHash` matches returns the cached index without rebuilding.
- [ ] **T-CACHE-2**: `prepareDocsIndex` with a cached index file whose `sourceHash` does not match the current text rebuilds and overwrites the cache file.
- [ ] **T-CACHE-3**: `prepareDocsIndex` with no cached index file builds a new index and writes it to disk.
- [ ] **T-CACHE-4**: `prepareDocsIndex` with a cached index file that contains invalid JSON rebuilds the index.
- [ ] **T-CACHE-5**: `prepareDocsIndex` with a cached index file that has a valid `sourceHash` but a missing `chunks` array rebuilds the index.
- [ ] **T-CACHE-6**: `prepareDocsIndex` with `cacheEntry.text = null` returns `null` without reading or writing any files.
- [ ] **T-CACHE-7**: The written index file is valid JSON and can be re-read and parsed successfully.
- [ ] **T-CACHE-8**: The written index file is pretty-printed with 2-space indentation.
- [ ] **T-CACHE-9**: Two sequential calls to `prepareDocsIndex` with the same text result in the second call loading from cache (no rebuild).

### Integration Tests: Search

- [ ] **T-SEARCH-1**: Searching for an exact section title returns that section as the top result.
- [ ] **T-SEARCH-2**: Searching with a query that appears in both the title and body of a chunk scores that chunk higher than one where the query appears only in the body.
- [ ] **T-SEARCH-3**: Searching with an empty string returns an empty array.
- [ ] **T-SEARCH-4**: Searching with a whitespace-only string returns an empty array.
- [ ] **T-SEARCH-5**: Searching with `maxResults = 1` returns at most 1 result.
- [ ] **T-SEARCH-6**: Searching with `maxResults = 8` returns at most 8 results.
- [ ] **T-SEARCH-7**: Searching with `maxResults = 100` is capped to 8 results (hard limit enforced by the tool, not the index search).
- [ ] **T-SEARCH-8**: Searching with `maxResults = 0` falls back to the default of 4 results.
- [ ] **T-SEARCH-9**: Searching with `maxResults = -1` falls back to the default of 4 results.
- [ ] **T-SEARCH-10**: Search results are sorted by score descending.
- [ ] **T-SEARCH-11**: A query with tokens that match no chunks returns an empty array.
- [ ] **T-SEARCH-12**: A query containing single-character tokens (e.g., `"a b c"`) discards those tokens. If no tokens remain, returns empty array.
- [ ] **T-SEARCH-13**: A query containing special characters that are preserved in tokenization (e.g., `"api.v2"`, `"src/index"`, `"key:value"`) correctly finds chunks containing those exact strings.
- [ ] **T-SEARCH-14**: Token deduplication works: searching for `"auth auth auth"` produces the same results as searching for `"auth"`.
- [ ] **T-SEARCH-15**: Case insensitivity: searching for `"AUTH"` produces the same results as searching for `"auth"`.
- [ ] **T-SEARCH-16**: The snippet includes context lines around the first matching token (not just the matching line itself).
- [ ] **T-SEARCH-17**: When the first matching token is on the first line of a chunk, the snippet starts at line 0 (no negative index).
- [ ] **T-SEARCH-18**: Searching an index with a single chunk returns that chunk if any token matches.
- [ ] **T-SEARCH-19**: Multi-word queries where the full query string appears in a title get the +12 title bonus.
- [ ] **T-SEARCH-20**: A query matching 500 chunks still returns only `maxResults` results.

### Integration Tests: `codeplane_docs_search` Tool

- [ ] **T-TOOL-1**: Invoking the tool with a valid query and a non-null index returns text content with numbered results.
- [ ] **T-TOOL-2**: Invoking the tool when `docsIndex` is `null` returns a text content response with the docs unavailable message.
- [ ] **T-TOOL-3**: Invoking the tool with docs in "stale" status includes the stale warning in the response text.
- [ ] **T-TOOL-4**: Invoking the tool with docs in "fresh" status does not include a stale warning.
- [ ] **T-TOOL-5**: Invoking the tool with `max_results: 2` returns at most 2 formatted results.
- [ ] **T-TOOL-6**: The tool response includes a `details` object with `status` and `hits` fields.
- [ ] **T-TOOL-7**: When the search returns zero results, the response text reads `No Codeplane docs sections matched "query"`.
- [ ] **T-TOOL-8**: The formatted result includes the section title and line range in the header (e.g., `[1] Section > Title (lines 10-25)`).

### E2E Tests: CLI Agent

- [ ] **T-E2E-1**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane` returns a structured response that includes `docs_status` with one of `"fresh"`, `"stale"`, or `"unavailable"` as the status.
- [ ] **T-E2E-2**: Running `codeplane agent ask "what is codeplane"` in one-shot mode (with pre-seeded docs cache) produces a response that cites documentation content (not a generic "I don't know" answer).
- [ ] **T-E2E-3**: Running `codeplane agent ask "what is codeplane"` with `CODEPLANE_AGENT_DOCS_URL` set to an invalid URL produces a response that includes a docs degradation warning in the structured summary (when `--format json` is used).
- [ ] **T-E2E-4**: Deleting `~/.codeplane/cache/agent/docs/llms-full.index.json` and restarting the agent results in the index being rebuilt (verified by checking the file exists after the session).
- [ ] **T-E2E-5**: Running two sequential agent sessions with the same docs cache results in the second session loading the cached index (verified by comparing `builtAt` timestamps—they should be identical).
- [ ] **T-E2E-6**: Setting `CODEPLANE_AGENT_DOCS_URL` to a local file server serving a custom `llms-full.txt` results in the agent indexing that custom content (verified by searching for a unique string from the custom file).
- [ ] **T-E2E-7**: Setting `CODEPLANE_AGENT_DOCS_TIMEOUT_MS=1` with a slow/unreachable docs URL results in the agent falling back to cached docs or reporting unavailable status.

### E2E Tests: API (Regression)

- [ ] **T-E2E-API-1**: The documentation index is a client-side feature. Verify that the agent session creation API (`POST /api/repos/:owner/:repo/agent/sessions`) does not depend on or reference the documentation index.
- [ ] **T-E2E-API-2**: The agent message creation API (`POST /api/repos/:owner/:repo/agent/sessions/:id/messages`) accepts tool_result parts that could contain docs search results (validates that the message schema supports the tool result format used by the docs tool).
