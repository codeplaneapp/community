# WIKI_UI

Specification for WIKI_UI.

## High-Level User POV

The wiki is a repository's built-in knowledge base — a place where teams document architecture decisions, onboarding guides, API references, runbooks, deployment procedures, and any long-form content that lives alongside the code. The wiki UI brings this knowledge base to life inside the Codeplane web application as a fully integrated, first-class section of every repository.

When a user navigates to a repository's wiki tab, they land on a clean, chronologically-ordered index of all wiki pages. The most recently updated pages appear first, making it easy to see what the team is actively working on. Each entry shows the page title, its URL-friendly slug, who last edited it, and when. For repositories with many pages, a search bar lets the user filter across titles, slugs, and page body content — the most relevant matches surface first, so the user finds what they need without scrolling through dozens of entries.

Clicking any page title opens the full reading view. The page renders Markdown faithfully — headings, code blocks with syntax highlighting, tables, lists, images, and links all display as the author intended. Metadata — the author, creation date, and last-updated timestamp — sits unobtrusively above the content. Users with write access see "Edit" and "Delete" action buttons; read-only viewers see a clean, distraction-free reading experience.

Creating a new wiki page is a single click from the wiki index. The user types a title, and a slug preview updates in real time beneath it. A full-width Markdown editor accepts the page body, with a basic formatting toolbar for common operations. An optional advanced section lets the user override the auto-generated slug with a custom one. Submitting creates the page instantly and navigates to the new page's view.

Editing works the same way — the existing title, slug, and body are pre-populated in the form, and the user can change any or all of them. Slug changes are validated against existing pages to prevent collisions. Saving an edit immediately updates the page and reflects the new "last updated" timestamp and author.

Deleting a page requires explicit confirmation through a modal dialog that names the page being deleted and warns that the action is permanent. Once confirmed, the page is removed and the user returns to the wiki index.

The entire experience is designed to feel lightweight and immediate. There are no drafts, no approval pipelines, and no versioning ceremony — wiki pages are living documents meant to be created quickly and iterated on. The wiki is accessible to anyone who can read the repository (including anonymous users on public repos), while write operations require write or admin access.

## Acceptance Criteria

## Definition of Done

The WIKI_UI feature is complete when a user can list, search, view, create, edit, and delete wiki pages entirely within the Codeplane web application, with behavior consistent with the API, CLI, and TUI surfaces.

## Wiki Index Page (`/:owner/:repo/wiki`)

- [ ] The wiki index page loads at `/:owner/:repo/wiki` and displays all wiki pages for the repository
- [ ] Each page entry shows: title (clickable link), slug (muted), author username, and relative last-updated timestamp
- [ ] Pages are sorted by `updated_at` descending (most recently updated first)
- [ ] The `body` field is NOT fetched or displayed in the list view
- [ ] A page count badge is displayed in the section header (e.g., "Wiki (42)")
- [ ] An empty repository wiki shows a centered empty state: "No wiki pages yet" with a "New Page" call-to-action button (visible only to write-access users)
- [ ] The wiki tab in the repository navigation shows the total page count as a badge

## Pagination

- [ ] Default page size is 30 items
- [ ] Maximum page size is 50 items
- [ ] Pagination controls (Previous / Next) appear when total results exceed the page size
- [ ] Current page number and total pages are displayed (e.g., "Page 2 of 5")
- [ ] Navigating beyond the last page shows an empty results area (no error)
- [ ] The `X-Total-Count` header from the API is used to calculate total pages
- [ ] Page and per_page parameters are reflected in the URL query string for shareability

## Search

- [ ] A search input is displayed above the wiki page list
- [ ] Search queries filter across page titles, slugs, and body content (server-side via `q` parameter)
- [ ] Search is debounced at 300ms after the user stops typing
- [ ] Search results are ranked by relevance: exact slug match → exact title match → title prefix → slug prefix → body match
- [ ] The result count is displayed when a search query is active (e.g., "12 results")
- [ ] An empty search result shows "No pages match your search" with a clear-search action
- [ ] Clearing the search input restores the full unfiltered list
- [ ] The search query is reflected in the URL query string (`?q=...`) for shareability
- [ ] Search queries containing SQL wildcards (`%`, `_`) are treated as literal characters
- [ ] Empty or whitespace-only search queries are treated as no filter

## Wiki Page View (`/:owner/:repo/wiki/:slug`)

- [ ] Navigating to `/:owner/:repo/wiki/:slug` displays the full wiki page with rendered Markdown body
- [ ] The page title is displayed as a prominent heading
- [ ] The slug is displayed as muted contextual text beneath the title
- [ ] A metadata line shows: author avatar + username (as a link to profile), created date, and last-updated date
- [ ] A breadcrumb is displayed: `Repository > Wiki > Page Title`
- [ ] The Markdown body is rendered with: headings (h1-h6), code blocks with syntax highlighting, inline code, tables, ordered and unordered lists, links (opening in new tab for external), images, blockquotes, horizontal rules, bold, italic, and strikethrough
- [ ] An empty body displays a centered placeholder: "This page has no content yet." with an Edit CTA for write-access users
- [ ] The page responds to direct URL access (deep-linkable)
- [ ] Slug normalization occurs: `Getting-Started` resolves to the page with slug `getting-started`
- [ ] A nonexistent slug displays a 404 page with message "Wiki page not found" and a link back to the wiki index

## Create Page (`/:owner/:repo/wiki/new`)

- [ ] A "New Page" button on the wiki index navigates to `/:owner/:repo/wiki/new`
- [ ] The "New Page" button is only visible to users with write access
- [ ] The create form contains: title field (autofocus, placeholder "Page title"), body field (full-width Markdown editor), and an advanced section (collapsed by default) with a custom slug override field
- [ ] A live slug preview updates beneath the title on each keystroke, showing the auto-generated slug
- [ ] The slug preview is replaced by the custom slug value when the advanced section is expanded and a custom slug is typed
- [ ] The Markdown editor includes a basic toolbar: bold, italic, heading, link, code block, unordered list, ordered list
- [ ] The "Create Page" submit button is disabled when the title field is empty
- [ ] Client-side validation: focusing away from an empty title field shows inline error "Title is required"
- [ ] On successful creation (201), the user is navigated to `/:owner/:repo/wiki/:slug` to view the new page
- [ ] On slug conflict (409), the form shows inline error: "A page with the slug '{slug}' already exists. Choose a different title or provide a custom slug." without clearing the form
- [ ] On permission error (403), the user is redirected to the wiki index with a flash notification
- [ ] A "Cancel" link navigates back to the wiki index without creating a page
- [ ] Title maximum length: 255 characters (after trim). Exceeding shows validation error
- [ ] Body maximum length: 1,000,000 characters. Exceeding shows validation error
- [ ] Slug maximum length: 255 characters (after normalization). Exceeding shows validation error
- [ ] A title consisting entirely of special characters (e.g., "!!!") that produces an empty slug shows validation error
- [ ] The command palette supports `wiki:create` to navigate to the create form

## Edit Page (`/:owner/:repo/wiki/:slug/edit`)

- [ ] An "Edit" button on the wiki page view navigates to `/:owner/:repo/wiki/:slug/edit`
- [ ] The "Edit" button is only visible to users with write access
- [ ] The edit form is pre-populated with the existing title, slug, and body
- [ ] The form validates that at least one field has been modified before enabling the "Save" button
- [ ] The slug field shows a warning if the new slug conflicts with an existing page (409 from server)
- [ ] On successful update (200), the user is navigated to the updated page view
- [ ] If the slug was changed, the new URL `/:owner/:repo/wiki/:new-slug` is used for navigation
- [ ] On 404 (page deleted while editing), the user is shown an error and redirected to the wiki index
- [ ] A "Cancel" link navigates back to the page view without saving
- [ ] The same title, slug, and body boundary constraints as create apply
- [ ] The editor shows a dirty-state indicator (e.g., unsaved dot in the tab or browser title)
- [ ] Navigating away with unsaved changes triggers a browser beforeunload confirmation

## Delete Page

- [ ] A "Delete" button on the wiki page view is visible only to users with write access
- [ ] Clicking "Delete" opens a confirmation modal: "Are you sure you want to permanently delete \"<title>\"? This action cannot be undone."
- [ ] The modal has "Cancel" and "Delete" buttons, with Delete styled as a destructive action (red)
- [ ] On successful deletion (204), the user is navigated to the wiki index with a success toast notification
- [ ] On error, an error toast is shown with the API error message
- [ ] After deletion, the page no longer appears in the wiki index or search results

## Edge Cases

- [ ] Duplicate slug creation from two browser tabs: the second submission receives a 409 conflict error
- [ ] Concurrent edit and delete: if a page is deleted while another user is editing, the save returns 404 and the user is shown an error
- [ ] Very long titles (255 characters) render without layout breakage
- [ ] Very long bodies (1,000,000 characters) render without crashing the browser (consider lazy rendering or virtualization)
- [ ] Unicode characters in titles are displayed correctly; slug auto-generation strips non-ASCII and shows the result
- [ ] HTML entities in titles (e.g., `<script>`) are displayed as plain text (no XSS)
- [ ] Markdown injection in body is sandboxed — no arbitrary HTML execution
- [ ] URL-encoded slug parameters are decoded correctly
- [ ] Browser back/forward navigation preserves wiki list state (search query, pagination)
- [ ] The wiki section is accessible via keyboard navigation (tab order, enter to activate)
- [ ] The wiki section is screen-reader accessible with appropriate ARIA labels

## Design

## Web UI Design

### Route Structure

| Route | Component | Description |
|---|---|---|
| `/:owner/:repo/wiki` | WikiIndex | List of all wiki pages with search and pagination |
| `/:owner/:repo/wiki/new` | WikiCreate | Create new wiki page form |
| `/:owner/:repo/wiki/:slug` | WikiView | Full page reading view |
| `/:owner/:repo/wiki/:slug/edit` | WikiEdit | Edit existing wiki page form |

### Wiki Index Page Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [Repository Navigation Tabs]                    ... Wiki(42) │
├──────────────────────────────────────────────────────────────┤
│  Wiki                                       [+ New Page]     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔍  Search wiki pages...                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Getting Started                     getting-started    │  │
│  │ @alice · updated 2 hours ago                           │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ API Reference                       api-reference      │  │
│  │ @bob · updated 3 days ago                              │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Deployment Guide                    deployment-guide   │  │
│  │ @charlie · updated 1 week ago                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ◀ Previous  Page 1 of 3  Next ▶                             │
└──────────────────────────────────────────────────────────────┘
```

- The header shows "Wiki" with the total page count badge and the "New Page" button (gated on write access).
- The search input spans the full width beneath the header. It debounces at 300ms and appends `?q=value` to the URL.
- Each page entry is a card/row with: title (bold, clickable, navigates to view), slug (muted, right-aligned or beneath title on mobile), author username prefixed with `@`, and relative timestamp for `updated_at` (e.g., "2 hours ago", "3 days ago"; switches to absolute date after 30 days).
- Pagination controls are rendered at the bottom. "Previous" is disabled on page 1. "Next" is disabled on the last page.

### Empty State

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                    📝                                         │
│              No wiki pages yet                               │
│                                                              │
│     Start documenting your project by creating               │
│     the first wiki page.                                     │
│                                                              │
│              [+ Create First Page]                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The "Create First Page" button is visible only to users with write access. Read-only and anonymous users see the empty state without the CTA.

### Wiki Page View Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Repository > Wiki > Getting Started                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Getting Started                          [Edit] [Delete]    │
│  /getting-started                                            │
│  🧑 alice · Created Mar 20 · Updated 2 hours ago             │
│                                                              │
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  # Welcome to Codeplane                                      │
│                                                              │
│  This guide walks you through setting up your                │
│  development environment.                                    │
│                                                              │
│  ## Prerequisites                                            │
│                                                              │
│  - Install jj                                                │
│  - Install the Codeplane CLI                                 │
│                                                              │
│  ```bash                                                     │
│  curl -fsSL https://... | sh                                 │
│  ```                                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- The breadcrumb chain: Repository name (link) > Wiki (link to index) > Page Title (current).
- Title displayed as a large heading (`<h1>` visual weight).
- Slug displayed as muted text beneath the title.
- Author avatar (if available) + username as a link to user profile, creation date (absolute), and last-updated date (relative within 30 days, absolute beyond).
- The "Edit" and "Delete" buttons are positioned top-right, visible only to write-access users. "Delete" is styled as a destructive action (red text or outlined red).
- A horizontal divider separates metadata from the rendered Markdown body.
- The Markdown body is rendered using a shared Markdown renderer component with syntax highlighting for code blocks (language-aware), proper table rendering, clickable links (external open in new tab), image rendering, and all standard Markdown features.
- An empty body shows a centered placeholder with an Edit CTA for write users.

### Wiki Create / Edit Form Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Repository > Wiki > New Page                                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Title                                                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Page title                                             │  │
│  └────────────────────────────────────────────────────────┘  │
│  Slug: getting-started                                       │
│                                                              │
│  ▶ Advanced options                                          │
│    ┌──────────────────────────────────────────────────────┐  │
│    │ Custom slug (optional)                               │  │
│    └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Body                                                        │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ [B] [I] [H] [🔗] [</>] [•] [1.]           Preview ▶ │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │                                                      │    │
│  │  Write your content in Markdown...                   │    │
│  │                                                      │    │
│  │                                                      │    │
│  │                                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│                           [Cancel]  [Create Page]            │
└──────────────────────────────────────────────────────────────┘
```

- **Title field**: single-line text input, autofocus on mount, placeholder "Page title". Live slug preview updates beneath on every keystroke. Inline validation error "Title is required" appears on blur if empty. Character counter shows when approaching the 255-character limit.
- **Advanced options**: collapsible section (default collapsed). Contains a custom slug input. When provided, it replaces the auto-generated slug preview.
- **Body editor**: full-width Markdown textarea with a formatting toolbar. Toolbar buttons: Bold (`**`), Italic (`*`), Heading (`#`), Link (`[]()`), Code Block (` ``` `), Unordered List (`-`), Ordered List (`1.`). An optional "Preview" toggle renders the Markdown body alongside or in place of the editor.
- **Submit button**: "Create Page" for create, "Save Changes" for edit. Disabled when title is empty or (for edit) when no changes have been made.
- **Cancel**: text link that navigates back to the wiki index (from create) or the page view (from edit).
- For the edit form, the breadcrumb reads: `Repository > Wiki > Page Title > Edit`.
- For the edit form, all fields are pre-populated with existing values.

### Delete Confirmation Modal

```
┌────────────────────────────────────────────┐
│          Delete wiki page?                 │
│                                            │
│  Are you sure you want to permanently      │
│  delete "Getting Started"?                 │
│                                            │
│  This action cannot be undone.             │
│                                            │
│              [Cancel]  [Delete]            │
└────────────────────────────────────────────┘
```

- Modal overlays the page view with a dimmed backdrop.
- The page title is quoted in the confirmation message.
- "Cancel" dismisses the modal. "Delete" is styled as a destructive button (red background or red text).
- While the delete request is in flight, the "Delete" button shows a loading spinner and is disabled.
- On success, the modal closes, a success toast appears, and the user is navigated to the wiki index.
- On error, the modal remains open and an error message is shown beneath the buttons.

### Responsive Design

- **Desktop (≥1024px)**: Full layout as diagrammed above.
- **Tablet (768px–1023px)**: Slug column hidden in list view. Editor and preview side-by-side replaced with tabbed view.
- **Mobile (<768px)**: Single-column layout. Slug hidden in list. Metadata stacked vertically. Editor full-width. Pagination simplified to Previous/Next only (no page numbers). Action buttons stack vertically on page view.

### Loading and Error States

- **Loading**: Skeleton placeholders for list items (3-5 skeleton rows). Spinner overlay for form submissions.
- **404 (page not found)**: Full-page message "Wiki page not found" with a link back to the wiki index.
- **403 (permission denied on private repo)**: Redirect to login if unauthenticated, or show "You do not have access to this repository's wiki" with a link to the repository overview.
- **Network error**: Toast notification with retry action. Form data is preserved on network failure.
- **Server error (500)**: Generic error page with retry action.

### Command Palette Integration

- `wiki:list` — Navigate to the wiki index for the current repository.
- `wiki:create` — Navigate to the wiki create form.
- `wiki:search` — Focus the search input on the wiki index.

---

## API Shape

The web UI consumes the existing wiki API endpoints. No new endpoints are required.

| Operation | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| List pages | `GET` | `/api/repos/:owner/:repo/wiki` | Query: `page`, `per_page`, `q` | `200` JSON array + `X-Total-Count` header |
| View page | `GET` | `/api/repos/:owner/:repo/wiki/:slug` | — | `200` JSON object with `body` |
| Create page | `POST` | `/api/repos/:owner/:repo/wiki` | JSON: `{title, slug?, body}` | `201` JSON object |
| Update page | `PATCH` | `/api/repos/:owner/:repo/wiki/:slug` | JSON: `{title?, slug?, body?}` | `200` JSON object |
| Delete page | `DELETE` | `/api/repos/:owner/:repo/wiki/:slug` | — | `204` No Content |

---

## Documentation

The following end-user documentation should be written:

1. **Wiki Overview Guide**: What the wiki is, how it fits into a repository, and how to navigate to it. Covers the relationship between the wiki index, page view, and create/edit flows.
2. **Browsing and Searching Wiki Pages**: How to use the wiki index, search functionality, pagination, and sort order. Includes screenshots of the index and search states.
3. **Creating a Wiki Page**: Step-by-step instructions for creating a page from the web UI, including the title field, slug preview, body editor toolbar, custom slug option, and what happens on submit. Also covers keyboard shortcuts.
4. **Editing a Wiki Page**: How to edit an existing page, including navigation from the page view, form behavior, slug change warnings, and save.
5. **Deleting a Wiki Page**: How to delete a page, including the confirmation modal, permanence warning, and post-deletion behavior.
6. **Wiki Permissions**: Who can read, create, edit, and delete wiki pages based on repository visibility and user roles.
7. **Markdown Formatting Reference**: Supported Markdown features in the wiki body editor, with examples of headings, code blocks, tables, lists, links, images, and other formatting.

## Permissions & Security

## Authorization Roles

### Read Access (Wiki Index, Page View, Search)

| Repository Visibility | Role | Access | HTTP Status if Denied |
|---|---|---|---|
| Public | Anonymous (unauthenticated) | ✅ Allowed | — |
| Public | Any authenticated user | ✅ Allowed | — |
| Private | Anonymous (unauthenticated) | ❌ Denied | 403 Forbidden |
| Private | Repository Owner | ✅ Allowed | — |
| Private | Organization Owner (if org-owned) | ✅ Allowed | — |
| Private | Team Member with `admin` permission | ✅ Allowed | — |
| Private | Team Member with `write` permission | ✅ Allowed | — |
| Private | Team Member with `read` permission | ✅ Allowed | — |
| Private | Collaborator with `admin` permission | ✅ Allowed | — |
| Private | Collaborator with `write` permission | ✅ Allowed | — |
| Private | Collaborator with `read` permission | ✅ Allowed | — |
| Private | Authenticated, no explicit permission | ❌ Denied | 403 Forbidden |

### Write Access (Create, Edit, Delete)

| Repository Visibility | Role | Access | HTTP Status if Denied |
|---|---|---|---|
| Any | Repository Owner | ✅ Allowed | — |
| Any | Organization Owner (if org-owned) | ✅ Allowed | — |
| Any | Team Member with `admin` permission | ✅ Allowed | — |
| Any | Team Member with `write` permission | ✅ Allowed | — |
| Any | Team Member with `read` permission | ❌ Denied | 403 Forbidden |
| Any | Collaborator with `admin` permission | ✅ Allowed | — |
| Any | Collaborator with `write` permission | ✅ Allowed | — |
| Any | Collaborator with `read` permission | ❌ Denied | 403 Forbidden |
| Any | Authenticated, no relationship | ❌ Denied | 403 Forbidden |
| Any | Unauthenticated | ❌ Denied | 401 Unauthorized |

### Permission Resolution Order

1. Check if viewer is the repository owner → full access
2. If org-owned, check if viewer is the organization owner → full access
3. Resolve highest team permission for viewer across all teams linked to the repo
4. Resolve direct collaborator permission
5. Take the highest of team permission and collaborator permission
6. If highest is `write` or `admin` → write operations allowed
7. If highest is `read` → read-only operations allowed
8. Otherwise → denied

### UI Gating

- The "New Page" button on the wiki index is only rendered when the current user has write access.
- The "Edit" and "Delete" buttons on the page view are only rendered when the current user has write access.
- The `/:owner/:repo/wiki/new` and `/:owner/:repo/wiki/:slug/edit` routes check write access on mount and redirect to the wiki index with a flash message if denied.
- Read-only and anonymous users see the wiki index and page views without any write action affordances.

## Rate Limiting

| Operation | Per-User Limit | Per-Repository Limit | Per-IP (Unauthenticated) |
|---|---|---|---|
| List / View / Search | 300 req/min | — | 60 req/min |
| Create | 30 pages/hour | 100 pages/hour | N/A (auth required) |
| Edit | 60 edits/hour | 200 edits/hour | N/A (auth required) |
| Delete | 60 deletes/hour | 200 deletes/hour | N/A (auth required) |

- Rate limit exceeded returns `429 Too Many Requests` with `Retry-After` header.
- The web UI should display a user-friendly error: "You're making too many requests. Please wait a moment and try again."
- Global payload size limit: request bodies exceeding 2 MB are rejected at the middleware layer.

## Data Privacy

- Wiki pages on private repositories are only accessible to authorized users. The API never returns title, slug, body, or author information to unauthorized viewers — it returns `403`, not a redacted response.
- The `author` field exposes `id` and `login` (username). No email or private profile information is included.
- Wiki page bodies may contain sensitive internal documentation on private repos. No additional server-side content scanning is performed by default.
- Search queries submitted by users are not persisted or logged at the application level (they appear in standard request logs only as query length, not content).
- No user IP addresses, session tokens, or device fingerprints are stored in wiki page records.
- HTML in Markdown bodies is sanitized during rendering to prevent XSS attacks. Script tags, event handlers, and other dangerous HTML constructs are stripped or escaped.

## Telemetry & Product Analytics

## Business Events

### WikiPagesListed

Fired every time the wiki index page is loaded or paginated.

| Property | Type | Description |
|---|---|---|
| `repository_id` | string | UUID of the repository |
| `owner` | string | Repository owner login |
| `repo` | string | Repository name |
| `viewer_id` | string? | UUID of the authenticated user (null if anonymous) |
| `has_search_query` | boolean | Whether a `q` parameter was provided |
| `search_query_length` | number | Character length of the search query (0 if none) |
| `page` | number | Requested page number (after normalization) |
| `per_page` | number | Requested per_page (after normalization) |
| `result_count` | number | Number of items returned in this page |
| `total_count` | number | Total matching items across all pages |
| `latency_ms` | number | Server-side processing time |
| `client` | string | `web` |

### WikiSearchPerformed

Fired only when a non-empty search query is submitted from the wiki index.

| Property | Type | Description |
|---|---|---|
| `repository_id` | string | UUID of the repository |
| `viewer_id` | string? | UUID of the authenticated user |
| `query` | string | The search query (truncated to 120 chars for privacy) |
| `result_count` | number | Number of matching results |
| `total_count` | number | Total matching results |
| `latency_ms` | number | Server-side processing time |
| `client` | string | `web` |

### WikiPageViewed

Fired every time a wiki page detail view is loaded.

| Property | Type | Description |
|---|---|---|
| `repository_id` | string | UUID of the repository |
| `wiki_page_id` | string | UUID of the viewed wiki page |
| `wiki_page_slug` | string | Slug of the viewed page |
| `viewer_id` | string? | UUID of the authenticated user (null if anonymous) |
| `body_length` | number | Character length of the page body |
| `latency_ms` | number | Server-side processing time |
| `client` | string | `web` |

### WikiPageCreated

Fired on successful page creation from the web UI.

| Property | Type | Description |
|---|---|---|
| `repository_id` | string | UUID of the repository |
| `wiki_page_id` | string | UUID of the created page |
| `wiki_page_slug` | string | Slug of the created page |
| `author_id` | string | UUID of the creating user |
| `slug_was_custom` | boolean | Whether the user provided a custom slug |
| `body_length` | number | Character length of the body |
| `client` | string | `web` |

### WikiPageCreateFailed

Fired on any create error from the web UI.

| Property | Type | Description |
|---|---|---|
| `repository_owner` | string | Owner from the URL |
| `repository_name` | string | Repo from the URL |
| `error_code` | number | HTTP status code (401/403/404/409/422) |
| `client` | string | `web` |

### WikiPageEdited

Fired on successful page edit from the web UI.

| Property | Type | Description |
|---|---|---|
| `repository_id` | string | UUID of the repository |
| `wiki_page_id` | string | UUID of the edited page |
| `wiki_page_slug` | string | Slug of the page (after edit) |
| `editor_id` | string | UUID of the editing user |
| `title_changed` | boolean | Whether the title was modified |
| `slug_changed` | boolean | Whether the slug was modified |
| `body_changed` | boolean | Whether the body was modified |
| `body_length` | number | Character length of the body after edit |
| `client` | string | `web` |

### WikiPageDeleted

Fired on successful page deletion from the web UI.

| Property | Type | Description |
|---|---|---|
| `repository_id` | string | UUID of the repository |
| `wiki_page_slug` | string | Slug of the deleted page |
| `deleter_id` | string | UUID of the deleting user |
| `page_age_seconds` | number | Time since page creation |
| `client` | string | `web` |

### WikiPageDeleteCancelled

Fired when the user opens the delete confirmation modal but clicks Cancel.

| Property | Type | Description |
|---|---|---|
| `repository_id` | string | UUID of the repository |
| `wiki_page_slug` | string | Slug of the page |
| `user_id` | string | UUID of the user |
| `client` | string | `web` |

## Funnel Metrics & Success Indicators

| Metric | Definition | Success Target |
|---|---|---|
| Wiki tab visit rate | % of repository visits that include a wiki tab visit | > 15% (indicates wiki adoption) |
| Wiki list → page view rate | % of wiki index visits that lead to a page view | > 40% |
| Wiki list → create rate | % of wiki index visits that lead to page creation | > 5% for repos with 0 pages |
| Wiki view → edit rate | % of wiki page views that lead to a wiki page edit | > 10% |
| Wiki search usage rate | % of wiki index visits that include a search query | > 10% |
| Wiki search success rate | % of search queries that return ≥ 1 result | > 70% |
| Create conflict rate | % of create attempts that result in 409 | < 5% |
| Create empty body rate | % of created pages with body_length == 0 | Track (high rate may indicate placeholder behavior) |
| Custom slug usage rate | % of creates where slug_was_custom == true | Track (informs slug algorithm quality) |
| Delete confirmation rate | WikiPageDeleted / (WikiPageDeleted + WikiPageDeleteCancelled) | Track (high cancel rate may indicate UI friction) |
| P95 wiki index latency | 95th percentile wiki list load time | < 500ms |
| P95 wiki view latency | 95th percentile wiki page view load time | < 300ms |
| CLI vs API vs TUI vs Web split | Distribution of wiki requests by client surface | Track for roadmap input |

## Observability

## Logging Requirements

### Request-Level Logging

Every wiki API request serving the web UI must emit a structured log entry at `INFO` level upon completion:

```json
{
  "level": "info",
  "msg": "wiki.list",
  "request_id": "uuid",
  "owner": "alice",
  "repo": "my-project",
  "viewer_id": "uuid-or-null",
  "page": 1,
  "per_page": 30,
  "has_query": true,
  "query_length": 15,
  "result_count": 12,
  "total_count": 42,
  "duration_ms": 23,
  "status": 200
}
```

Similar structured entries for `wiki.view`, `wiki.create`, `wiki.edit`, `wiki.delete` with operation-specific fields.

### Log Levels by Operation

| Event | Level | Structured Context |
|---|---|---|
| Wiki page list/view completed | `INFO` | `request_id`, `owner`, `repo`, `viewer_id`, `duration_ms`, `status` |
| Wiki page created successfully | `INFO` | `request_id`, `repository_id`, `wiki_page_id`, `slug`, `author_id` |
| Wiki page edited successfully | `INFO` | `request_id`, `repository_id`, `wiki_page_id`, `slug`, `editor_id`, `fields_changed` |
| Wiki page deleted successfully | `INFO` | `request_id`, `repository_id`, `slug`, `deleter_id` |
| Wiki page create conflict (409) | `WARN` | `request_id`, `repository_id`, `slug`, `author_id` |
| Wiki page validation failed (422) | `WARN` | `request_id`, `repository_id`, `field`, `code`, `author_id` |
| Wiki page permission denied (403) | `WARN` | `request_id`, `repository_id`, `user_id` |
| Wiki page not found (404) | `WARN` | `request_id`, `owner`, `repo`, `slug_length` |
| Wiki page unauthenticated attempt (401) | `INFO` | `request_id`, `owner`, `repo` |
| Wiki internal error (500) | `ERROR` | `request_id`, `repository_id`, `error_message`, `stack_trace` |
| Malformed JSON body (400) | `WARN` | `request_id`, `owner`, `repo` |

### Sensitive Data Rules

- Search query content (`q`) is logged only as `query_length`, not as the full string, to avoid PII in logs.
- Wiki body content must never appear in logs.
- Slug values are logged as `slug_length` in view/error scenarios, but full slug is logged for successful mutations (slugs are not PII).
- Viewer ID is logged but never email, session tokens, or IP addresses at the application log level.

## Prometheus Metrics

### Counters

| Metric | Labels | Description |
|---|---|---|
| `codeplane_wiki_list_requests_total` | `status`, `has_query` | Total wiki list requests by HTTP status and search usage |
| `codeplane_wiki_view_requests_total` | `status` | Total wiki view requests by HTTP status |
| `codeplane_wiki_pages_created_total` | `owner`, `repo` | Total wiki pages created |
| `codeplane_wiki_pages_edited_total` | `owner`, `repo` | Total wiki pages edited |
| `codeplane_wiki_pages_deleted_total` | `owner`, `repo` | Total wiki pages deleted |
| `codeplane_wiki_list_errors_total` | `error_type` (400/403/404/500) | Total wiki list errors by type |
| `codeplane_wiki_view_errors_total` | `error_type` (400/403/404/422/500) | Total wiki view errors by type |
| `codeplane_wiki_create_errors_total` | `error_code` (401/403/404/409/422/500) | Total wiki create errors by type |
| `codeplane_wiki_edit_errors_total` | `error_code` (401/403/404/409/422/500) | Total wiki edit errors by type |
| `codeplane_wiki_delete_errors_total` | `error_code` (400/401/403/404/429/500) | Total wiki delete errors by type |

### Histograms

| Metric | Labels | Buckets | Description |
|---|---|---|---|
| `codeplane_wiki_list_duration_seconds` | `has_query` | 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5 | Wiki list request latency |
| `codeplane_wiki_view_duration_seconds` | — | 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2 | Wiki view request latency |
| `codeplane_wiki_create_duration_seconds` | — | 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5 | Wiki create request latency |
| `codeplane_wiki_edit_duration_seconds` | — | 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5 | Wiki edit request latency |
| `codeplane_wiki_delete_duration_seconds` | — | 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2 | Wiki delete request latency |
| `codeplane_wiki_view_body_size_bytes` | — | 100, 500, 1K, 5K, 10K, 50K, 100K, 500K, 1M | Body size distribution for viewed pages |
| `codeplane_wiki_create_body_size_bytes` | — | 100, 500, 1K, 5K, 10K, 50K, 100K, 500K, 1M | Body size distribution for created pages |

### Gauges

| Metric | Labels | Description |
|---|---|---|
| `codeplane_wiki_pages_total` | `repository_id` | Current number of wiki pages per repository |

## Alerts

### Alert: WikiHighErrorRate

**Condition:** `(sum(rate(codeplane_wiki_list_errors_total{error_type="500"}[5m])) + sum(rate(codeplane_wiki_view_errors_total{error_type="500"}[5m])) + sum(rate(codeplane_wiki_create_errors_total{error_code="500"}[5m])) + sum(rate(codeplane_wiki_edit_errors_total{error_code="500"}[5m])) + sum(rate(codeplane_wiki_delete_errors_total{error_code="500"}[5m]))) / (sum(rate(codeplane_wiki_list_requests_total[5m])) + sum(rate(codeplane_wiki_view_requests_total[5m])) + sum(rate(codeplane_wiki_pages_created_total[5m])) + sum(rate(codeplane_wiki_pages_edited_total[5m])) + sum(rate(codeplane_wiki_pages_deleted_total[5m]))) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check the `codeplane_wiki_*_errors_total{error_code="500"}` dashboard to determine which operation(s) are failing (list, view, create, edit, or delete).
2. Query application logs for `level=error msg=wiki.*` in the affected time window to identify the root cause.
3. Check PostgreSQL connection pool health: `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'`.
4. Check if the `wiki_pages` table is experiencing lock contention or if a schema migration is running.
5. If DB connection pool exhaustion: restart the server process and investigate connection leak.
6. If specific query failures: check for table locks, missing indexes, or disk space issues.
7. If `countWikiPagesByRepo` or related queries return null: verify the wiki_pages table exists and has the expected schema.
8. Escalate to database on-call if not resolved within 15 minutes.

### Alert: WikiListHighLatency

**Condition:** `histogram_quantile(0.95, rate(codeplane_wiki_list_duration_seconds_bucket[5m])) > 2`

**Severity:** Warning

**Runbook:**
1. Check if latency spike correlates with search queries (`has_query=true`) — ILIKE queries on large body columns are expensive.
2. Run `EXPLAIN ANALYZE` on the `searchWikiPagesByRepo` query for a large repository to check for sequential scans.
3. If sequential scan detected: verify that `idx_wiki_pages_repository_id` index exists; consider adding a trigram index for ILIKE performance.
4. Check DB load: `SELECT * FROM pg_stat_user_tables WHERE relname = 'wiki_pages'` for sequential scan counts.
5. If isolated to one repo with thousands of pages: consider pagination query optimization or full-text search index migration.

### Alert: WikiViewHighLatency

**Condition:** `histogram_quantile(0.95, rate(codeplane_wiki_view_duration_seconds_bucket[5m])) > 1`

**Severity:** Warning

**Runbook:**
1. Check if the latency spike correlates with pages that have very large bodies (>500KB) by examining `codeplane_wiki_view_body_size_bytes`.
2. Verify the `(repository_id, slug)` composite index exists on the `wiki_pages` table.
3. Check network layer: large response payloads may be buffered by proxies.
4. If large body serialization is the bottleneck, consider response streaming in a future iteration.

### Alert: WikiCreateHighConflictRate

**Condition:** `rate(codeplane_wiki_create_errors_total{error_code="409"}[1h]) / rate(codeplane_wiki_pages_created_total[1h]) > 0.25`

**Severity:** Warning

**Runbook:**
1. This is likely a product UX issue, not an infrastructure issue.
2. Check if a single user or automation is repeatedly attempting to create pages with conflicting slugs.
3. Review if the slugification algorithm is producing unexpected collisions.
4. File a product issue if the conflict rate persists, recommending improved slug suggestion or deduplication UX.

### Alert: WikiDeleteBulkSpike

**Condition:** `rate(codeplane_wiki_pages_deleted_total[5m]) > 10`

**Severity:** Info

**Runbook:**
1. May indicate automated cleanup or abuse. Check which userId is responsible.
2. Review rate limit effectiveness.
3. Consider if a bulk-delete API should be offered instead.

### Alert: WikiHigh404Rate

**Condition:** `rate(codeplane_wiki_view_errors_total{error_type="404"}[5m]) > 20`

**Severity:** Warning

**Runbook:**
1. Check logs for the specific slugs returning 404 to determine if they are stale links or automated scan traffic.
2. Determine if a popular wiki page was recently deleted or had its slug changed.
3. If caused by a slug rename: consider adding redirect support for old slugs (product enhancement request).
4. If caused by bots or crawlers: consider rate-limiting by IP or adding `robots.txt` exclusion for wiki paths.

## Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|---|---|---|---|
| Repository not found | 404 | Returns `"repository not found"` | User verifies owner/repo path |
| Wiki page not found | 404 | Returns `"wiki page not found"` | User checks slug or navigates via list |
| Empty owner/repo in URL | 400 | Returns `"owner is required"` / `"repository name is required"` | User provides correct URL |
| Empty/whitespace slug | 400 | Returns `"wiki slug is required"` | User provides a valid slug |
| Slug normalizes to empty | 422 | Returns validation error for slug field | User provides alphanumeric slug |
| Private repo, no auth | 403 | Returns `"permission denied"` | User authenticates |
| Private repo, insufficient perm | 403 | Returns `"permission denied"` | User requests access from admin |
| No write access for mutation | 403 | Returns `"permission denied"` | User contacts repo admin |
| No auth for mutation | 401 | Returns `"authentication required"` | User logs in |
| Slug conflict on create/edit | 409 | Returns `"wiki page already exists"` | User chooses different title/slug |
| Title missing/empty | 422 | Returns validation error with field details | User provides a title |
| Title exceeds 255 chars | 422 | Returns validation error | User shortens the title |
| Body exceeds 1,000,000 chars | 400 | Returns `"bad request"` | User reduces body size |
| Slug exceeds 255 chars | 422 | Returns validation error | User shortens slug |
| Malformed JSON body | 400 | Returns `"invalid request body"` | User fixes request format |
| Request payload > 2 MB | 400/413 | Rejected at middleware | User reduces payload size |
| Rate limit exceeded | 429 | Returns with `Retry-After` header | User waits and retries |
| DB connection failure | 500 | Returns generic internal error | Automatic pool reconnection |
| DB query timeout | 500 | Returns generic internal error | Retry; check DB health |
| Concurrent delete during edit | 404 | Edit save returns page not found | User acknowledges page was deleted |

## Verification

## Playwright (Web UI) E2E Tests

### Wiki Index Page

- [ ] **Wiki index loads and displays pages**: Navigate to `/:owner/:repo/wiki`. Assert the page renders with a list of wiki pages showing title, slug, author, and timestamp for each.
- [ ] **Wiki index shows correct sort order**: Create pages A (older), B (newer), then update A. Assert A appears before B (most recently updated first).
- [ ] **Wiki index page count badge**: Create 5 wiki pages. Assert the header shows "Wiki (5)".
- [ ] **Wiki index omits body field**: Inspect the network request for the list API. Assert response items do not contain a `body` field.
- [ ] **Wiki index empty state (write user)**: Navigate to wiki on a repo with no pages as a write user. Assert "No wiki pages yet" message and "New Page" CTA button are visible.
- [ ] **Wiki index empty state (read-only user)**: Navigate as a read-only user. Assert empty state message is visible but "New Page" CTA is NOT visible.
- [ ] **Wiki index empty state (anonymous on public repo)**: Navigate without auth. Assert empty state message visible, no CTA.
- [ ] **New Page button visible for write user**: Assert "New Page" button is rendered.
- [ ] **New Page button hidden for read-only user**: Assert "New Page" button is NOT rendered.
- [ ] **New Page button hidden for anonymous user on public repo**: Assert button is NOT rendered.
- [ ] **Click page title navigates to detail**: Click a wiki page title. Assert URL changes to `/:owner/:repo/wiki/:slug` and page content is displayed.

### Pagination

- [ ] **Default pagination shows 30 items**: Create 35 wiki pages. Assert index shows exactly 30 items on first load.
- [ ] **Pagination controls appear**: With 35 pages, assert "Next" button is visible and enabled, "Previous" is visible and disabled.
- [ ] **Next page loads correct items**: Click "Next". Assert 5 items are displayed. Assert page indicator shows "Page 2".
- [ ] **Previous page returns to first page**: Click "Next" then "Previous". Assert original 30 items displayed.
- [ ] **Page beyond last returns empty**: Navigate to `?page=100`. Assert empty results area (no error), pagination shows correct total.
- [ ] **URL reflects pagination state**: Click "Next". Assert URL contains `?page=2`.
- [ ] **Direct URL pagination works**: Navigate to `/:owner/:repo/wiki?page=2&per_page=10`. Assert 10 items are shown from the correct offset.

### Search

- [ ] **Search input is displayed**: Assert search input with placeholder is visible above the wiki list.
- [ ] **Search filters results**: Create pages "Alpha Guide" and "Beta Reference". Type "Alpha" in search. Assert only "Alpha Guide" appears after debounce.
- [ ] **Search is debounced**: Type rapidly. Assert only one API call fires after typing stops (within 300ms window).
- [ ] **Search result count badge**: Search with query matching 3 pages. Assert "3 results" badge is displayed.
- [ ] **Search empty result**: Search for "nonexistent-gibberish". Assert "No pages match your search" message.
- [ ] **Clear search restores full list**: Search for a term, then clear the input. Assert full unfiltered list is restored.
- [ ] **Search URL reflects query**: Type "alpha" in search. Assert URL contains `?q=alpha`.
- [ ] **Search from URL**: Navigate to `/:owner/:repo/wiki?q=alpha`. Assert search input is pre-filled and results are filtered.
- [ ] **Search is case-insensitive**: Create page titled "Architecture". Search "architecture". Assert it appears.
- [ ] **Search by body content**: Create page with body containing "deployment pipeline". Search "deployment". Assert it appears.
- [ ] **Search by slug**: Create page with slug `api-reference`. Search `api-reference`. Assert it appears.
- [ ] **Search relevance ranking**: Create pages with slug `setup`, title "Setup Guide", and another with body containing "setup". Search "setup". Assert slug-match page appears first.
- [ ] **Search with pagination**: Create 40 pages containing "docs". Search "docs" with per_page=10. Assert pagination controls appear for 4 pages.
- [ ] **Search with SQL wildcards**: Search with `%_\`. Assert no error and results are treated as literal matches.

### Wiki Page View

- [ ] **Page view loads at URL**: Navigate to `/:owner/:repo/wiki/:slug`. Assert page renders with title, slug, author, timestamps, and rendered body.
- [ ] **Breadcrumb is displayed**: Assert breadcrumb shows `Repository Name > Wiki > Page Title`.
- [ ] **Breadcrumb navigation**: Click "Wiki" in breadcrumb. Assert navigation to wiki index.
- [ ] **Title displays as heading**: Assert title renders as a prominent heading element.
- [ ] **Slug displays as muted text**: Assert slug is visible beneath the title in muted/secondary color.
- [ ] **Author and timestamps display**: Assert author username is visible as a link, with created and updated dates.
- [ ] **Markdown body renders headings**: Create page with `# Heading\n## Subheading`. View it. Assert h1 and h2 elements render.
- [ ] **Markdown body renders code blocks with syntax highlighting**: Create page with fenced code block (```js). View it. Assert syntax-highlighted code block renders.
- [ ] **Markdown body renders tables**: Create page with Markdown table. View it. Assert HTML table renders.
- [ ] **Markdown body renders lists**: Create page with `- item1\n- item2`. View it. Assert unordered list renders.
- [ ] **Markdown body renders links**: Create page with `[link](https://example.com)`. View it. Assert clickable link renders, external links open in new tab.
- [ ] **Markdown body renders images**: Create page with `![alt](url)`. View it. Assert image element renders.
- [ ] **Empty body placeholder (write user)**: Create page with empty body. View as write user. Assert "This page has no content yet." with Edit CTA.
- [ ] **Empty body placeholder (read user)**: View empty-body page as read user. Assert placeholder text without Edit CTA.
- [ ] **Edit button visible for write user**: Assert "Edit" button is rendered.
- [ ] **Edit button hidden for read-only user**: Assert "Edit" button is NOT rendered.
- [ ] **Delete button visible for write user**: Assert "Delete" button is rendered.
- [ ] **Delete button hidden for read-only user**: Assert "Delete" button is NOT rendered.
- [ ] **Click Edit navigates to edit form**: Click "Edit". Assert URL changes to `/:owner/:repo/wiki/:slug/edit`.
- [ ] **404 for nonexistent slug**: Navigate to `/:owner/:repo/wiki/nonexistent-slug`. Assert 404 page with "Wiki page not found" and link back to wiki index.
- [ ] **Slug normalization**: Create page with slug `getting-started`. Navigate to `/:owner/:repo/wiki/Getting-Started`. Assert the page loads correctly (case-insensitive).
- [ ] **Back navigation preserves list state**: Search on index, navigate to a page, click back. Assert search query and pagination are preserved.
- [ ] **XSS prevention in title**: Create page with title `<script>alert('xss')</script>`. View it. Assert title renders as plain text, no script execution.
- [ ] **Public repo, unauthenticated view**: View a wiki page on a public repo without auth. Assert 200 and full content.
- [ ] **Private repo, unauthenticated view**: Navigate to a private repo wiki page without auth. Assert redirect to login or 403.

### Create Page

- [ ] **Create form loads at URL**: Navigate to `/:owner/:repo/wiki/new`. Assert form renders with title, body fields, and submit/cancel buttons.
- [ ] **Create form breadcrumb**: Assert breadcrumb shows `Repository > Wiki > New Page`.
- [ ] **Title field has autofocus**: Assert the title field is focused on page load.
- [ ] **Slug preview updates on title input**: Type "My First Page" in title. Assert slug preview shows `my-first-page`.
- [ ] **Slug preview with special characters**: Type "Hello World!!" in title. Assert slug preview shows `hello-world`.
- [ ] **Custom slug override**: Expand advanced options. Type "custom-slug" in slug field. Assert slug preview updates to `custom-slug`.
- [ ] **Submit with valid title and body**: Fill title "Test Page", body "Content". Click "Create Page". Assert navigation to `/:owner/:repo/wiki/test-page` with correct content.
- [ ] **Submit with empty body**: Fill title "Empty Page", leave body empty. Click "Create Page". Assert 201 and navigation to new page.
- [ ] **Submit button disabled when title empty**: Assert "Create Page" button is disabled when title field is empty.
- [ ] **Client-side validation on empty title**: Focus title field, then blur without typing. Assert inline error "Title is required".
- [ ] **Slug conflict error (409)**: Create page "Home", navigate back to create, try to create "Home" again. Assert inline error about slug conflict without clearing form.
- [ ] **Cancel navigates back**: Click "Cancel". Assert navigation to wiki index.
- [ ] **Title at maximum length (255 chars)**: Type a 255-character title. Submit. Assert 201 success.
- [ ] **Title exceeding maximum length (256 chars)**: Type a 256-character title. Submit. Assert validation error.
- [ ] **Body at maximum length (1,000,000 chars)**: Submit a page with 1,000,000-character body. Assert 201 success.
- [ ] **Body exceeding maximum (1,000,001 chars)**: Submit a page with body exceeding limit. Assert validation error.
- [ ] **Title with only special characters**: Type "!!!" as title. Submit. Assert validation error about empty slug.
- [ ] **Created page appears in wiki index**: Create a page. Navigate to wiki index. Assert the new page appears in the list.
- [ ] **Permission-gated route**: Navigate to `/:owner/:repo/wiki/new` as a read-only user. Assert redirect to wiki index with flash message.
- [ ] **Unauthenticated access**: Navigate to create route without auth. Assert redirect to login.
- [ ] **Markdown toolbar inserts formatting**: Click bold toolbar button. Assert `**` markers inserted in body.
- [ ] **Keyboard shortcut submission**: Fill title and body. Press `Ctrl+Enter`. Assert page is created.

### Edit Page

- [ ] **Edit form loads with pre-populated data**: Navigate to `/:owner/:repo/wiki/:slug/edit`. Assert title, slug, and body fields are pre-populated with existing values.
- [ ] **Edit form breadcrumb**: Assert breadcrumb shows `Repository > Wiki > Page Title > Edit`.
- [ ] **Save changes after title modification**: Change the title. Click "Save Changes". Assert navigation to updated page with new title.
- [ ] **Save changes after body modification**: Change the body content. Save. Assert page view shows updated body.
- [ ] **Save changes after slug modification**: Change the slug. Save. Assert navigation to new slug URL.
- [ ] **Slug conflict on edit (409)**: Try to change slug to an existing page's slug. Assert conflict error.
- [ ] **Save button disabled when no changes**: Assert "Save Changes" is disabled when form matches original values.
- [ ] **Cancel navigates back to page view**: Click "Cancel". Assert navigation to `/:owner/:repo/wiki/:slug`.
- [ ] **404 during edit (page deleted)**: Another user deletes the page while editing. Save. Assert error message and redirect.
- [ ] **Browser beforeunload on dirty form**: Modify a field, then try to navigate away. Assert browser beforeunload prompt.
- [ ] **Permission-gated route**: Navigate to edit route as a read-only user. Assert redirect.
- [ ] **Author updates to editor**: Edit a page as user B (originally created by user A). View the page. Assert author shows user B.

### Delete Page

- [ ] **Delete confirmation modal opens**: Click "Delete" button on page view. Assert confirmation modal appears with page title in message.
- [ ] **Cancel dismisses modal**: Click "Cancel" in modal. Assert modal closes, page is NOT deleted.
- [ ] **Confirm delete removes page**: Click "Delete" in modal. Assert 204, toast notification, navigation to wiki index.
- [ ] **Deleted page gone from index**: After deletion, assert the page no longer appears in the wiki index list.
- [ ] **Deleted page returns 404**: After deletion, navigate to the deleted page's URL. Assert 404.
- [ ] **Delete button loading state**: Click "Delete" in modal. Assert button shows loading spinner and is disabled during request.
- [ ] **Delete error shows error in modal**: Mock a 500 server error. Click "Delete". Assert error message in modal, modal stays open.
- [ ] **Delete last page shows empty state**: Delete the only wiki page. Assert wiki index shows empty state.
- [ ] **Double-delete**: Delete a page, navigate back to a cached version and try to delete again. Assert 404 error.
- [ ] **Delete not available for read-only**: Visit page as read-only user. Assert no "Delete" button.

### Cross-Cutting Concerns

- [ ] **Responsive layout (desktop)**: At 1024px width, assert full layout with slug columns and side-by-side editor.
- [ ] **Responsive layout (mobile)**: At 375px width, assert single-column layout, slug hidden in list, stacked action buttons.
- [ ] **Loading skeleton on index**: Navigate to wiki index. Assert skeleton placeholders render before data loads.
- [ ] **Loading spinner on form submit**: Submit create/edit form. Assert spinner overlay during request.
- [ ] **Network error toast with retry**: Disconnect network, attempt to load wiki. Assert error toast with retry action.
- [ ] **Keyboard accessibility**: Tab through wiki index to page link, press Enter. Assert navigation to page view.
- [ ] **Command palette wiki:list**: Open command palette, type "wiki:list". Assert navigation to wiki index.
- [ ] **Command palette wiki:create**: Open command palette, type "wiki:create". Assert navigation to create form.

## API Integration Tests

### List (backing wiki index)

- [ ] **List empty wiki returns empty array**: `GET /api/repos/:owner/:repo/wiki` on empty wiki. Assert `200`, `[]`, `X-Total-Count: 0`.
- [ ] **List returns pages sorted by updated_at DESC**: Create A then B, update A. Assert A appears first.
- [ ] **List omits body**: Assert response items do not contain `body` field.
- [ ] **List with default pagination**: Create 35 pages. Assert 30 returned.
- [ ] **List with per_page=50 (max)**: Create 60 pages. `per_page=50`. Assert 50 returned.
- [ ] **List with per_page > 50 capped silently**: `per_page=100`. Assert at most 50 returned.
- [ ] **X-Total-Count header present and correct**: With 42 pages, assert `X-Total-Count: 42`.
- [ ] **Search by title**: Create "Alpha" and "Beta". `q=Alpha`. Assert only "Alpha" returned.
- [ ] **Search is case-insensitive**: `q=alpha` matches "Alpha".
- [ ] **Search by body content**: Create page with body "deployment pipeline". `q=deployment`. Assert returned.
- [ ] **Search relevance ranking**: Assert exact slug match ranks highest.
- [ ] **Search with no results**: `q=nonexistent`. Assert empty array, `X-Total-Count: 0`.
- [ ] **Page beyond last returns empty array**: `page=100`. Assert `200`, `[]`.
- [ ] **Non-integer page defaults gracefully**: `page=abc`. Assert no 500.
- [ ] **Public repo, unauthenticated**: Assert `200`.
- [ ] **Private repo, unauthenticated**: Assert `403`.
- [ ] **Private repo, read collaborator**: Assert `200`.
- [ ] **Private repo, no permission**: Assert `403`.
- [ ] **Nonexistent repository**: Assert `404`.
- [ ] **Long search query (1000 chars)**: Assert no 500.
- [ ] **Unicode search query**: `q=日本語`. Assert no crash.
- [ ] **SQL wildcards in search**: `q=%_\`. Assert literal matching, no SQL injection.

### View (backing page view)

- [ ] **View existing page returns full body**: Create page, GET by slug. Assert `200` with `body` included.
- [ ] **View with slug normalization**: Create `getting-started`, GET `Getting-Started`. Assert `200`.
- [ ] **View nonexistent slug**: Assert `404`.
- [ ] **View empty body page**: Assert `200` with `body: ""`.
- [ ] **View page with max body (1M chars)**: Assert `200` with full body returned.
- [ ] **Public repo, unauthenticated**: Assert `200`.
- [ ] **Private repo, unauthenticated**: Assert `403`.

### Create (backing create form)

- [ ] **Create with title and body**: POST. Assert `201` with `id`, `slug`, `title`, `body`, `author`.
- [ ] **Auto-generated slug**: POST with title "My First Page!". Assert slug is `my-first-page`.
- [ ] **Custom slug**: POST with explicit slug. Assert slug matches.
- [ ] **Empty body allowed**: POST with `body: ""`. Assert `201`.
- [ ] **Duplicate slug returns 409**: Create same slug twice. Assert `409`.
- [ ] **Missing title returns 422**: POST without title. Assert `422`.
- [ ] **Whitespace-only title returns 422**: POST with `title: "   "`. Assert `422`.
- [ ] **Title at 255 chars**: Assert `201`.
- [ ] **Title at 256 chars**: Assert `422`.
- [ ] **Body at 1,000,000 chars**: Assert `201`.
- [ ] **Body at 1,000,001 chars**: Assert `400`.
- [ ] **All-special-chars title**: POST with `title: "!!!"`. Assert `422` (empty slug).
- [ ] **Unauthenticated**: Assert `401`.
- [ ] **Read-only collaborator**: Assert `403`.
- [ ] **Nonexistent repo**: Assert `404`.
- [ ] **Concurrent duplicate creates**: Two simultaneous POSTs with same slug. One gets `201`, other gets `409`.

### Edit (backing edit form)

- [ ] **Edit title**: PATCH with new title. Assert `200` with updated title.
- [ ] **Edit slug**: PATCH with new slug. Assert `200` with new slug.
- [ ] **Edit body**: PATCH with new body. Assert `200` with updated body.
- [ ] **Edit slug to existing slug**: Assert `409`.
- [ ] **Edit nonexistent page**: Assert `404`.
- [ ] **Edit with no changes**: PATCH with empty object. Assert `400` or `422`.
- [ ] **Unauthenticated edit**: Assert `401`.
- [ ] **Read-only edit**: Assert `403`.
- [ ] **Author updated to editor**: Edit as user B. Assert `author.login` is B's login.

### Delete (backing delete flow)

- [ ] **Delete returns 204**: DELETE existing page. Assert `204`.
- [ ] **Deleted page not in list**: After delete, list endpoint excludes it.
- [ ] **Deleted page returns 404**: After delete, GET returns `404`.
- [ ] **Double delete returns 404**: Delete twice. Second returns `404`.
- [ ] **Delete without auth**: Assert `401`.
- [ ] **Delete with read-only access**: Assert `403`.
- [ ] **Delete nonexistent page**: Assert `404`.
- [ ] **Cross-repo isolation**: Delete in repo A does not affect repo B.

## CLI E2E Tests (cross-surface consistency)

- [ ] **Create via CLI, verify in web**: `codeplane wiki create --title "CLI Page" --body "Content" --repo OWNER/REPO`. Navigate to wiki index in browser. Assert page appears.
- [ ] **Edit via CLI, verify in web**: `codeplane wiki edit slug --title "Updated"`. Refresh page view. Assert updated title.
- [ ] **Delete via CLI, verify in web**: `codeplane wiki delete slug --yes`. Refresh wiki index. Assert page is gone.
- [ ] **Create in web, verify via CLI**: Create page in browser. Run `codeplane wiki view slug --json`. Assert matching data.
- [ ] **Search via CLI matches web**: `codeplane wiki list --query "term" --json`. Compare with web search results. Assert same items.
