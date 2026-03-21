# RELEASE_UI_DETAIL

Specification for RELEASE_UI_DETAIL.

## High-Level User POV

As a repository maintainer, I want to view detailed release information including release notes, assets, metadata, and download links so that I can manage and distribute versioned software artifacts through the Codeplane web UI. The release detail page should display the release title, tag/bookmark, author, creation date, markdown-rendered body, asset list with download links and file sizes, and provide edit/delete actions for authorized users.

## Acceptance Criteria

1. Release detail page renders at /:owner/:repo/releases/:id with full release metadata (title, tag, author, date, pre-release badge, draft badge).
2. Release body is rendered as markdown with sanitized HTML output.
3. Asset list displays filename, file size (human-readable), download count, and a download link for each attached asset.
4. Edit and Delete buttons appear only for users with write permission on the repository.
5. Edit navigates to /:owner/:repo/releases/:id/edit with pre-populated form fields.
6. Delete triggers a confirmation dialog before calling DELETE /api/v1/repos/:owner/:repo/releases/:id.
7. Page handles 404 gracefully when release ID does not exist.
8. Page loads release data from GET /api/v1/repos/:owner/:repo/releases/:id and assets from GET /api/v1/repos/:owner/:repo/releases/:id/assets.
9. Asset upload form (for edit mode) supports drag-and-drop and file picker, calling POST /api/v1/repos/:owner/:repo/releases/:id/assets.
10. Asset deletion is supported per-asset with confirmation, calling DELETE /api/v1/repos/:owner/:repo/releases/:id/assets/:asset_id.
11. Release detail is accessible from the releases list page via click-through navigation.
12. Back navigation returns to the releases list preserving scroll position.

## Design

The release detail view is a SolidJS route component at apps/ui/src/pages/repo/releases/[id].tsx. It uses the shared repoContext for owner/repo resolution and calls the @codeplane/ui-core API client for data fetching. The page layout follows the existing repo page pattern: a top section with release metadata (title as h1, tag/bookmark badge, author avatar + name, relative timestamp, pre-release/draft badges), a main content area with markdown-rendered body using the shared markdown renderer component, and a bottom section with an asset table. Assets are displayed in a table with columns: filename, size, downloads, and action (download link icon). Edit/delete controls appear in the page header area, gated by a permission check against the current user's repo role. The edit form reuses the release creation form component with initial values populated. The confirmation dialog for delete uses the shared dialog/modal component from ui-core. Styling follows the existing Tailwind/design-token patterns used across other repo detail pages (issue detail, landing detail).

## Permissions & Security

Read access to the repository is required to view the release detail page. Write access to the repository is required to see and use edit/delete controls for releases and assets. Asset download links are accessible to anyone with read access. Admin access is required to delete releases that have associated workflow artifacts. Permission checks are performed both client-side (for UI gating) and server-side (in the release service endpoints).

## Telemetry & Product Analytics

Track release_detail_viewed event with properties: owner, repo, release_id, has_assets (boolean), asset_count. Track release_asset_downloaded with: owner, repo, release_id, asset_id, asset_filename. Track release_deleted with: owner, repo, release_id. Track release_edit_started and release_edit_completed with: owner, repo, release_id. Track asset_uploaded and asset_deleted with: owner, repo, release_id, asset_id.

## Observability

Log release detail page loads at info level with owner/repo/release_id. Log 404s for missing releases at warn level. Log asset download requests at info level with asset metadata. Log release deletion at info level with actor and release metadata. Monitor API response times for release detail and asset list endpoints. Alert on elevated 5xx rates on release detail endpoints. Include release_id in structured log context for all release-scoped operations.

## Verification

1. Unit test: Release detail component renders all metadata fields correctly given mock release data.
2. Unit test: Asset table renders correct file sizes, download counts, and download links.
3. Unit test: Edit/delete buttons are hidden when user lacks write permission.
4. Unit test: Delete confirmation dialog appears and cancellation prevents API call.
5. Integration test: GET /api/v1/repos/:owner/:repo/releases/:id returns correct release with assets.
6. Integration test: DELETE /api/v1/repos/:owner/:repo/releases/:id returns 403 for unauthorized users.
7. Integration test: Asset upload via POST and deletion via DELETE work correctly.
8. E2E test: Navigate from releases list to release detail, verify all content renders.
9. E2E test: Create a release with assets, view detail page, download an asset, delete the release.
10. E2E test: Verify markdown rendering of release body including code blocks, links, and images.
