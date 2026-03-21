# REPO_OVERVIEW_UI

Specification for REPO_OVERVIEW_UI.

## High-Level User POV

As a developer navigating to a repository's main page (/:owner/:repo), I see a comprehensive overview that includes: the repo description and topics, a language breakdown bar, the default bookmark's latest changes, a rendered README, quick-stat badges (stars, watchers, forks, open issues, open landing requests), clone/download actions (SSH + HTTPS URLs with copy buttons, download archive dropdown), and a file/tree browser rooted at the default bookmark. The overview is the canonical entry point for understanding what a repository is, what it contains, and how to get started with it.

## Acceptance Criteria

1. The repo overview page loads at /:owner/:repo and displays the repository description, topics, and visibility badge.
2. A language breakdown bar shows detected languages with proportional colored segments and percentage labels.
3. The file/tree browser displays the root tree of the default bookmark with icons for files vs directories, clickable navigation into subdirectories, and breadcrumb path navigation.
4. The README (if present) is rendered as Markdown below the file browser, supporting headings, code blocks, images, links, tables, and task lists.
5. Quick-stat badges display counts for stars, watchers, forks, open issues, and open landing requests, each linking to its respective section.
6. Clone/download actions show SSH and HTTPS URLs with copy-to-clipboard buttons and an archive download dropdown (zip, tar.gz).
7. The latest change on the default bookmark is shown with change ID, author, timestamp, and description summary.
8. Star and watch toggle buttons reflect the current user's state and update optimistically on click.
9. Fork button navigates to the fork creation flow.
10. The overview gracefully handles: empty repositories (shows setup instructions instead of file browser), missing README (omits README section), and unauthenticated users (hides star/watch/fork actions or shows login prompts).
11. The page is server-authoritative: all data comes from existing API endpoints (repo detail, tree, file content, stats).
12. Mobile/responsive: the layout stacks vertically on narrow viewports with the file browser and README remaining readable.

## Design

## Components
- **RepoOverviewPage**: Top-level route component at /:owner/:repo/index. Composes all sub-sections.
- **RepoHeader**: Displays owner/repo name, visibility badge, description, topics as chips, and action buttons (star, watch, fork, clone dropdown).
- **LanguageBar**: Horizontal stacked bar chart of detected languages with a legend. Data sourced from the repo detail API's language breakdown field.
- **CloneDropdown**: Popover with SSH/HTTPS URL fields, copy buttons, and archive download links. Uses the repo's clone URLs from the detail API.
- **FileTreeBrowser**: Table/list of files and directories at the current tree path. Fetches from the jj tree API endpoint. Supports navigation via URL query param or path segments. Shows file icon, name, latest change description snippet, and relative timestamp.
- **ReadmeRenderer**: Fetches the README file (README.md, readme.md, README) from the file content API at the default bookmark root. Renders Markdown to HTML using the existing Markdown rendering pipeline (likely remark/rehype or similar already in the UI).
- **QuickStats**: Row of badge-style counters linking to /issues, /landings, /stargazers, /watchers, /forks.
- **LatestChange**: Compact card showing the tip change of the default bookmark with change ID (truncated, with copy), author avatar, relative time, and description.

## Data Flow
- RepoOverviewPage uses the existing `repoContext` and repo detail loader which provides description, topics, visibility, stats, default bookmark, clone URLs, and language data.
- FileTreeBrowser calls GET /api/repos/:owner/:repo/tree?path=<root>&bookmark=<default>.
- ReadmeRenderer calls GET /api/repos/:owner/:repo/content?path=README.md&bookmark=<default> and falls back to alternate README filenames.
- All data fetching uses SolidJS resources with the existing API client from @codeplane/ui-core.

## Layout
- Full-width page within the repo layout shell.
- Vertical stack: RepoHeader → QuickStats + CloneDropdown row → LanguageBar → FileTreeBrowser → ReadmeRenderer.
- Sidebar (if present in repo layout) remains unchanged.

## Permissions & Security

- **Unauthenticated users**: Can view all public repository overview data (description, files, README, stats, language bar, clone URLs). Cannot star, watch, or fork. Clone URLs are still shown (repos are publicly cloneable).
- **Authenticated non-members**: Full read access to public repos. Can star, watch, and fork. Private repos return 404.
- **Repository members (read)**: Same as authenticated non-members plus access to private repo overviews.
- **Repository members (write/admin)**: Same read access on overview. Admin-only actions (settings gear icon) may appear in the header but are not part of the overview spec.
- **Deploy key access**: Not applicable to web UI; deploy keys are SSH/API-only.
- **Organization visibility**: Org-internal repos visible only to org members; overview respects existing repo visibility enforcement from the API layer.

## Telemetry & Product Analytics

- **Page view event**: `repo.overview.viewed` with properties: owner, repo, is_authenticated, referrer_source.
- **Action events**: `repo.overview.star_toggled`, `repo.overview.watch_toggled`, `repo.overview.fork_initiated`, `repo.overview.clone_url_copied` (with clone_type: ssh|https), `repo.overview.archive_downloaded` (with format: zip|tar.gz).
- **Navigation events**: `repo.overview.file_clicked`, `repo.overview.directory_navigated`, `repo.overview.stat_badge_clicked` (with target: issues|landings|stars|watchers|forks).
- **Performance marks**: Time-to-first-meaningful-paint for the overview page, README render duration, tree fetch duration.

## Observability

- **API latency monitoring**: Track p50/p95/p99 latency for the repo detail, tree, and content endpoints as they are the critical path for overview rendering.
- **Error rates**: Monitor 4xx/5xx rates on tree and content endpoints scoped to overview page loads.
- **README render failures**: Log and count cases where README fetch succeeds but Markdown rendering throws (malformed content).
- **Empty repo detection**: Count how often the empty-repo fallback UI is shown (indicates onboarding funnel health).
- **Cache hit rates**: If any CDN or server-side caching is added for README or tree data, track hit/miss ratios.
- **Client-side error boundary**: The overview page should have an error boundary that logs render failures with repo context to the structured logging pipeline.

## Verification

1. **Unit tests**: Test RepoHeader rendering with various combinations of description, topics, and visibility. Test LanguageBar with edge cases (single language, no languages, many languages). Test ReadmeRenderer with various Markdown features and missing README fallback.
2. **Integration tests**: Test FileTreeBrowser navigation (root → subdirectory → back via breadcrumb) against a mock API. Test clone URL copy-to-clipboard functionality. Test star/watch toggle optimistic updates and rollback on API failure.
3. **E2E tests**: Navigate to a repo overview, verify all sections render with correct data. Test empty repo shows setup instructions. Test unauthenticated view hides action buttons. Test file browser navigation updates URL and content. Test README rendering for a repo with a known README.
4. **Visual regression**: Snapshot the overview page for a representative repo to catch layout regressions.
5. **Accessibility**: Verify all interactive elements are keyboard-navigable. Verify language bar has aria-labels. Verify file browser table has proper semantic markup. Verify clone URLs are selectable and copyable via keyboard.
6. **Performance**: Verify overview page loads in under 2 seconds on a cold cache with a repo containing <1000 files at root level. Verify no layout shift after initial render (README and tree should not cause CLS).
