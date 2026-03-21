# JJ_README_RENDER

Specification for JJ_README_RENDER.

## High-Level User POV

As a repository viewer, when I navigate to a repository's overview page, I want to see the README rendered beautifully with full jj-native context so that I can quickly understand the project's purpose, setup instructions, and contribution guidelines without leaving the Codeplane interface.

## Acceptance Criteria

1. The repository overview page fetches and renders README files (README.md, README, README.txt, readme.md) from the repository root at the current working copy revision.
2. Markdown READMEs are rendered with full GitHub-flavored markdown support including headings, code blocks with syntax highlighting, tables, task lists, images, and links.
3. Relative links and image paths within the README resolve correctly to the repository's file browser routes.
4. The README render respects the repository's default bookmark/branch context and updates when the user switches bookmarks.
5. If no README file exists, the overview page displays the repository description and file tree without an error state.
6. README rendering performs in under 200ms for files up to 1MB.
7. The rendered README is available via API endpoint GET /api/v1/repos/:owner/:repo/readme returning both raw content and rendered HTML.
8. CLI `repo view` command displays a terminal-friendly rendered version of the README.
9. TUI repository detail screen shows the README content below the repository metadata.

## Design

The README rendering pipeline has three layers:

**Server layer**: A new `readme` endpoint in the repos route family that resolves the README file from the jj working copy tree, detects the file format, and returns both raw and rendered content. The rendering uses a shared markdown processor from `packages/sdk` that handles GFM parsing, sanitization, and relative URL rewriting scoped to the repository's file browser paths.

**Web UI layer**: The repository overview component (`apps/ui/src/pages/repo/overview`) fetches the rendered README HTML from the API and injects it into a styled container with Codeplane's typography tokens. Code blocks use the existing syntax highlighting infrastructure. Image proxying goes through the repository raw content endpoint to avoid CORS issues.

**CLI/TUI layer**: The CLI uses a terminal markdown renderer (e.g., marked-terminal or similar) to display README content with ANSI formatting. The TUI uses Ink's text primitives to render a simplified markdown view.

The markdown processor lives in `packages/sdk/src/services/markdown.ts` as a shared service to ensure consistent rendering across server-side pre-rendering and any client-side fallback needs. Relative URL rewriting is parameterized by `{owner, repo, bookmark}` context so links like `./docs/setup.md` resolve to `/:owner/:repo/blob/:bookmark/docs/setup.md`.

## Permissions & Security

README content follows repository visibility rules: public repositories serve README to unauthenticated users, private repositories require authenticated read access. No additional permission scopes are needed beyond existing repository read permissions. Deploy keys with read access can fetch README via API. The markdown renderer sanitizes HTML to prevent XSS — no raw HTML passthrough for script tags, event handlers, or data URIs.

## Telemetry & Product Analytics

Track README render requests with `readme.render` event including: repository ID, file format (md/txt/none), content size in bytes, render duration in ms, and whether the request was authenticated or anonymous. Aggregate metrics: README availability rate across repositories, p50/p95 render latency, cache hit rate if caching is added later.

## Observability

Log README fetch failures (missing file, parse errors, timeout) at WARN level with repository context. Expose a `codeplane_readme_render_duration_seconds` histogram metric. Alert if README render p95 exceeds 500ms or if error rate exceeds 5% over a 5-minute window. Include README resolution in the repository health check surface visible in admin views.

## Verification

1. Unit tests for the markdown processor covering: GFM features, relative URL rewriting, HTML sanitization, edge cases (empty file, binary file, extremely large file).
2. Integration tests for the README API endpoint covering: public repo unauthenticated access, private repo auth enforcement, missing README 404 behavior, bookmark-scoped README resolution.
3. E2E tests for the web UI covering: README renders on repository overview, code block syntax highlighting works, relative links navigate correctly within the app, image rendering works.
4. CLI integration test: `repo view` outputs formatted README content to stdout.
5. Performance test: README render for a 500KB markdown file completes within 200ms.
6. Security test: Markdown with embedded script tags, event handlers, and data URIs is sanitized in rendered output.
