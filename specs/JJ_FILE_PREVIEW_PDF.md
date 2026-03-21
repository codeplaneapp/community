# JJ_FILE_PREVIEW_PDF

Specification for JJ_FILE_PREVIEW_PDF.

## High-Level User POV

When browsing a jj-native repository on Codeplane, developers regularly encounter PDF files — technical documentation, research papers, generated reports, LaTeX output, design specifications, and data sheets. Today, these files are detected as binary and the user is met with a dead-end: "Binary file — preview not available." To verify that a documentation change produced the correct PDF, or that a research paper is properly formatted, the developer must download the file and open it in a separate application. This breaks the flow of code exploration and makes reviewing changes that involve document artifacts unnecessarily friction-filled.

With PDF preview, Codeplane renders PDF documents inline wherever file content is displayed. In the web UI's Code Explorer, clicking a PDF file in the tree loads an embedded PDF viewer in the content panel. The file header shows the file's path, size, and page count, and the user can scroll through pages, zoom in and out, navigate to specific pages, and search within the document — all without leaving Codeplane. In a landing request review, when a change adds, modifies, or removes a PDF, the reviewer can see both versions side by side and navigate them page-by-page to visually compare differences. In the CLI, `codeplane change cat` on a PDF file defaults to outputting raw bytes (suitable for piping to `open`, `xdg-open`, or `zathura`), while `--json` mode returns rich PDF metadata including page count and page dimensions. `--info` prints a human-readable summary. In the TUI, since rendering a full PDF is not feasible in a text terminal, the user sees a PDF info card showing the document's page count, page dimensions, file size, title (if available), and a direct download URL — a clear improvement over the opaque binary placeholder.

PDF preview is not limited to the code explorer. Any Codeplane surface that displays file content — change detail views, landing request file browsers, agent context panels, and wiki attachments — can benefit from inline PDF display where the client supports it. For the web and desktop clients, PDFs render via an embedded viewer. For the TUI and CLI, a rich metadata card replaces the generic binary message.

The feature supports standard PDF files identified by the `%PDF-` magic signature. Files are identified by both file extension (`.pdf`) and content-type sniffing via magic byte detection, handling cases where files are misnamed or lack extensions. Very large PDFs (over 50 MB) are not previewed inline — the user is shown metadata and a download link instead, to protect browser memory and bandwidth. Encrypted or password-protected PDFs show metadata with a clear indicator that the document requires a password, along with a download link so the user can open it locally.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/file/:change_id/*` returns a `pdf_metadata` object for recognized PDF files, including `mime_type`, `page_count`, `width`, `height`, `title`, and `author`.
- [ ] The change-scoped file content endpoint `GET /api/repos/:owner/:repo/changes/:change_id/content/*` returns the same `pdf_metadata` for PDF files.
- [ ] PDF files are flagged as `is_binary: true` and additionally include `is_pdf: true` and `pdf_metadata` in the response.
- [ ] The web UI Code Explorer renders an embedded PDF viewer when a user selects a PDF file in the tree.
- [ ] The web UI diff viewer shows side-by-side PDF comparison for PDF changes in landing request and change detail views.
- [ ] The TUI displays a PDF info card (page count, dimensions, title, author, size, download URL) instead of the generic "Binary file — preview not available" message.
- [ ] The CLI `change cat` on a PDF file outputs raw bytes by default (suitable for piping to a system PDF viewer) and returns `pdf_metadata` in `--json` mode.
- [ ] All PDF files are correctly identified via both file extension and magic byte detection.
- [ ] E2E tests cover single-page PDFs, multi-page PDFs, oversized PDFs, encrypted PDFs, corrupted PDFs, and all client surfaces.
- [ ] Documentation is updated for API reference, CLI reference, web guide, and TUI guide.

### Functional Constraints

- [ ] Supported format: PDF (`.pdf` extension, `application/pdf` MIME type).
- [ ] PDF detection uses a two-pass approach: (1) file extension mapping to expected MIME type, (2) magic byte validation of the first 5 bytes to confirm or override.
- [ ] Magic byte signature: `%PDF-` (hex `25 50 44 46 2D`) at byte offset 0.
- [ ] PDF metadata extraction includes: `page_count` (integer), `width` (first page width in points), `height` (first page height in points), `title` (string or null from document info dictionary), `author` (string or null from document info dictionary), `encrypted` (boolean), `pdf_version` (string, e.g., `"1.7"`).
- [ ] `pdf_metadata.mime_type` is always `"application/pdf"`.
- [ ] Maximum inline preview: 50 MB. Larger PDFs return `preview_available: false`.
- [ ] `?encoding=base64` returns base64-encoded PDF content for PDFs ≤ 50 MB.
- [ ] `Accept: application/octet-stream` for raw download continues to work.
- [ ] Encrypted/password-protected PDFs: `pdf_metadata.encrypted: true`, `page_count: null`, `width: null`, `height: null`, `preview_available: false`.
- [ ] `language` field returns `null` for PDFs.
- [ ] PDF content must not be logged.
- [ ] Metadata extraction must complete within 2 seconds; if exceeded, return partial metadata with `page_count: null`.
- [ ] `title` and `author` fields are trimmed to 500 characters maximum and sanitized for control characters.

### Edge Cases

- [ ] `.pdf` extension with non-PDF content (e.g., a text file renamed to `.pdf`): `is_pdf: false`.
- [ ] `.txt` extension with `%PDF-` magic bytes: detected as PDF, `is_pdf: true`.
- [ ] Zero-byte file with `.pdf` extension: `is_pdf: false`, treated as empty.
- [ ] Corrupted PDF (valid `%PDF-` header, truncated body): `is_pdf: true`, `page_count: null`, `width: null`, `height: null`, `preview_available` based on size.
- [ ] PDF at exactly 50 MB: `preview_available: true`.
- [ ] PDF at 50 MB + 1 byte: `preview_available: false`.
- [ ] PDF with 0 pages (degenerate but valid structure): `page_count: 0`, `preview_available: false`.
- [ ] PDF with extremely large page count (>10,000 pages): `page_count` reported accurately, web viewer limits to first 200 pages with "Load more" affordance.
- [ ] PDF with non-standard page sizes (mixed A4/Letter/custom within same document): `width` and `height` reflect first page.
- [ ] PDF with title/author containing Unicode: returned as-is (UTF-8).
- [ ] PDF with title/author containing null bytes or control characters: stripped before returning.
- [ ] PDF with no title or author metadata: `title: null`, `author: null`.
- [ ] Linearized (web-optimized) PDF: no behavioral difference; metadata extracted normally.
- [ ] PDF/A (archival) variant: treated as standard PDF.
- [ ] Renamed PDF: in diff views, old and new paths resolve correctly for comparison.
- [ ] Deleted PDF: `side=old` returns the previous PDF metadata.
- [ ] PDF with embedded fonts: no impact on metadata extraction; web viewer handles rendering.
- [ ] PDF with form fields: rendered read-only in web viewer; forms are not interactive.
- [ ] PDF that is actually a PDF portfolio/collection: `page_count` from the first embedded document or null if parsing fails.

## Design

### API Shape

The PDF preview feature extends existing file content API responses. No new endpoints are created.

**Extended fields on `GET /api/repos/:owner/:repo/file/:change_id/*`** and **`GET /api/repos/:owner/:repo/changes/:change_id/content/*`**:

```json
{
  "path": "docs/architecture.pdf",
  "content": null,
  "encoding": "utf8",
  "language": null,
  "size": 1245678,
  "line_count": 0,
  "is_binary": true,
  "is_truncated": false,
  "is_pdf": true,
  "pdf_metadata": {
    "mime_type": "application/pdf",
    "format": "pdf",
    "page_count": 24,
    "width": 612,
    "height": 792,
    "title": "System Architecture Specification",
    "author": "Jane Developer",
    "encrypted": false,
    "pdf_version": "1.7",
    "preview_available": true
  }
}
```

Encrypted PDF response:
```json
{
  "path": "docs/confidential.pdf",
  "content": null,
  "encoding": "utf8",
  "language": null,
  "size": 892345,
  "line_count": 0,
  "is_binary": true,
  "is_truncated": false,
  "is_pdf": true,
  "pdf_metadata": {
    "mime_type": "application/pdf",
    "format": "pdf",
    "page_count": null,
    "width": null,
    "height": null,
    "title": null,
    "author": null,
    "encrypted": true,
    "pdf_version": "1.7",
    "preview_available": false
  }
}
```

Oversized PDF (>50 MB) returns `preview_available: false` and `content: null` regardless of encoding parameter.

**`pdf_metadata` schema**: `mime_type` (string, always `"application/pdf"`), `format` (string, always `"pdf"`), `page_count` (number|null), `width` (number|null, points), `height` (number|null, points), `title` (string|null, max 500 chars), `author` (string|null, max 500 chars), `encrypted` (boolean), `pdf_version` (string|null), `preview_available` (boolean).

### SDK Shape

New interface `PDFMetadata` and utility function `detectPDFMetadata(filePath, content, maxPreviewSize?)` added to SDK. Returns `PDFMetadata | null`. Added to `FileContentResponse` and `ChangeFileContentResponse` as `is_pdf: boolean` and `pdf_metadata: PDFMetadata | null`.

```typescript
interface PDFMetadata {
  mime_type: "application/pdf";
  format: "pdf";
  page_count: number | null;
  width: number | null;
  height: number | null;
  title: string | null;
  author: string | null;
  encrypted: boolean;
  pdf_version: string | null;
  preview_available: boolean;
}
```

Detection function signature:
```typescript
async function detectPDFMetadata(
  filePath: string,
  content: Buffer,
  maxPreviewSize?: number
): Promise<PDFMetadata | null>
```

The function must: (1) Check for `%PDF-` magic bytes at offset 0. (2) If magic bytes match, parse the PDF cross-reference table and document info dictionary to extract `page_count`, page dimensions, `title`, `author`, `encrypted`, and `pdf_version`. (3) If metadata extraction fails or times out (2s), return partial metadata with null fields rather than throwing. (4) Set `preview_available` based on file size (≤50 MB) and encryption status (not encrypted).

### Web UI Design

**Code Explorer — PDF Preview Panel**:

1. **File header bar**: `PDF` badge (document color, distinct from `IMAGE` badge), file size, page count (e.g., "24 pages"), and page dimensions.
2. **Embedded PDF viewer**: Uses PDF.js to render PDF pages within the content panel. The viewer occupies the full content panel area below the header.
3. **Viewer toolbar** (sticky at top of viewer area): Page navigator (`< Page 3 of 24 >` with direct page number input field), Zoom controls (Zoom Out, zoom level display, Zoom In, Fit Page, Fit Width), Fullscreen toggle button, Search button (opens search bar overlay within the viewer), Download button, Open in New Tab button.
4. **Page rendering area**: Pages render sequentially in a scrollable container. Scroll position updates the page navigator. Pages load lazily as the user scrolls (only current page ± 2 pages rendered at any time).
5. **Document info footer** (toggle via `i` key): Title, Author, Page count, Dimensions, PDF version, File size, Encrypted status.
6. **Oversized PDFs (>50 MB)**: Info card with page count (if extractable), dimensions, file size, and a prominent "Download" button. Message: "This PDF is too large to preview in the browser. Download to view locally."
7. **Encrypted PDFs**: Info card with lock icon, message "This PDF is password-protected and cannot be previewed in the browser. Download to open with a PDF reader.", and Download button.
8. **Corrupted PDFs**: If PDF.js fails to render, show error message "PDF could not be rendered" with Download button fallback and any available metadata.
9. **Loading state**: Skeleton shimmer matching the page aspect ratio while PDF.js initializes and the first page renders.
10. **Text selection**: Enabled by default. Users can select and copy text from the rendered PDF.
11. **Keyboard shortcuts**: `←`/`→` or `PgUp`/`PgDn` for previous/next page, `Home`/`End` for first/last page, `+`/`-` for zoom in/out, `Ctrl+F`/`Cmd+F` for search, `f` for fullscreen, `i` for info footer.

**Diff Viewer — PDF Diff**:

1. **Added PDF**: Full preview with green "Added" badge. Single-panel viewer.
2. **Deleted PDF**: Info card with red "Deleted" badge showing old PDF metadata. Download button for the deleted version.
3. **Modified PDF**: Side-by-side layout with synchronized page navigation. Left panel: "Old" PDF viewer. Right panel: "New" PDF viewer. Synchronized scrolling toggle (on by default). Metadata diff below: page count change and size change with red/green coloring.
4. **Diff fallback for large PDFs**: If either version is >50 MB, show metadata comparison card instead of side-by-side viewers.

### CLI Command

Default output: raw bytes to stdout (pipe-friendly). `--json`: full response with `pdf_metadata`. `--info`: human-readable summary (Format, MIME, Pages, Dimensions, Title, Author, Size, Encrypted). `--json --encoding base64`: base64 content. All existing flags (`--repo`, `--raw`) work unchanged.

Example `--info` output:
```
Format:     PDF 1.7
MIME:       application/pdf
Pages:      24
Dimensions: 612 × 792 pt (8.50 × 11.00 in)
Title:      System Architecture Specification
Author:     Jane Developer
Size:       1.2 MB
Encrypted:  No
```

### TUI UI

PDF info card replaces "Binary file — preview not available". Card shows: Format, Pages, Dimensions, Title, Author, Size, Encrypted fields in a centered card. `PDF` badge in header (document color). Encrypted PDFs show lock icon and "Encrypted: Yes (preview unavailable)". Keybindings: `d` download, `y` copy path, `Y` copy download URL, `h`/`Left` return to tree.

### Documentation

1. **API Reference — File Content** (`docs/api/file-content.mdx`): Add `is_pdf`, `pdf_metadata` to schema. Examples for standard PDF, encrypted PDF, oversized PDF, corrupted PDF. Document magic byte detection and 50 MB threshold.
2. **API Reference — Change File Content** (`docs/api/change-file-content.mdx`): Same extensions for change-scoped endpoint.
3. **Web Guide — Code Browsing** (`docs/guides/code-browsing.mdx`): PDF Preview section with screenshots of embedded viewer, toolbar, page navigation, and search. PDF diff comparison section with screenshot of side-by-side view.
4. **CLI Reference** (`docs/cli/change.mdx`): `--info` flag for PDF files. Piping examples.
5. **TUI Guide** (`docs/tui/file-browsing.mdx`): PDF info card description, `d` keybinding.
6. **Supported Formats Reference** (`docs/reference/file-formats.mdx`): Add PDF row to format table with MIME type, extensions, features, and preview limits.

## Permissions & Security

### Authorization Matrix

PDF preview uses the same authorization as the file content API. No additional permissions required.

| Role | Public Repository | Private Repository |
|------|-------------------|--------------------||
| Anonymous | ✅ View PDF metadata and preview | ❌ 401 |
| Authenticated (no repo access) | ✅ View PDF metadata and preview | ❌ 403 |
| Repository Read | ✅ View and download | ✅ View and download |
| Repository Write | ✅ View and download | ✅ View and download |
| Repository Admin | ✅ View and download | ✅ View and download |
| Owner | ✅ View and download | ✅ View and download |
| Org Member (team read) | ✅ View and download | ✅ View and download |
| Deploy Key (read) | ✅ View and download (via SSH/API) | ✅ View and download (via SSH/API) |

This is a read-only feature.

### Rate Limiting

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 60 requests | per hour, per IP |
| Authenticated user | 5,000 requests | per hour, per token/session |
| Deploy key | 5,000 requests | per hour, per key |
| Agent session | 10,000 requests | per hour, per session |

Additional bandwidth limit: 1 GB/hour for base64-encoded PDF content per authenticated user, 100 MB/hour for anonymous. Exceeded returns `429` with `{"message": "bandwidth limit exceeded"}`.

### Data Privacy & Security

- **PDF JavaScript execution**: PDF.js in the web viewer must have JavaScript execution disabled (`enableScripting: false`). PDFs must not be able to execute embedded JavaScript.
- **PDF external references**: PDF.js must be configured to block all external resource loading (`isEvalSupported: false`).
- **PDF form submission**: Form submission actions in PDFs must be blocked. Forms render read-only.
- **Content-Type safety**: Raw downloads use `application/octet-stream` with `Content-Disposition: attachment`.
- **Path traversal**: Same `..` rejection as file content API.
- **Memory safety**: Metadata extraction reads only the cross-reference table and info dictionary, not the full page tree. The server does not render PDF pages.
- **Sensitive document content**: PDF content (text, images within the PDF) must never be logged or indexed by the metadata extraction process. Only structural metadata (page count, dimensions, info dict fields) is extracted.
- **Malicious PDF defense**: The server-side parser only extracts metadata; it does not render or interpret page content. PDF.js on the client is a well-hardened renderer.
- **Title/Author sanitization**: Document info dictionary strings are sanitized to remove null bytes and control characters (U+0000–U+001F except U+0009/U+000A/U+000D) and truncated to 500 characters to prevent injection.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `PDFPreviewViewed` | Successful PDF preview render in web viewer | `owner`, `repo`, `change_id`, `file_path`, `page_count`, `size_bytes`, `encrypted`, `pdf_version`, `preview_available`, `client`, `render_time_ms` |
| `PDFPreviewDownloaded` | Raw download from preview UI | `owner`, `repo`, `change_id`, `file_path`, `size_bytes`, `client` |
| `PDFPreviewPageNavigated` | User navigates to a different page | `owner`, `repo`, `change_id`, `file_path`, `page_number`, `total_pages`, `navigation_method` (scroll/input/arrow/keyboard) |
| `PDFPreviewSearched` | User searches within a PDF | `owner`, `repo`, `change_id`, `file_path`, `query_length`, `results_count` |
| `PDFPreviewZoomChanged` | User changes zoom level | `owner`, `repo`, `file_path`, `zoom_level`, `zoom_action` (in/out/fit-page/fit-width) |
| `PDFPreviewFullscreen` | User toggles fullscreen mode | `owner`, `repo`, `file_path`, `fullscreen` (true/false) |
| `PDFDiffViewed` | PDF diff rendered in landing/change view | `owner`, `repo`, `change_id`, `file_path`, `change_type`, `old_page_count`, `new_page_count`, `old_size`, `new_size` |
| `PDFDiffSyncToggled` | User toggles synchronized scrolling | `owner`, `repo`, `change_id`, `file_path`, `sync_enabled` |
| `PDFPreviewOversized` | PDF exceeds 50 MB limit | `owner`, `repo`, `file_path`, `size_bytes`, `page_count` |
| `PDFPreviewEncrypted` | Encrypted PDF encountered | `owner`, `repo`, `file_path`, `size_bytes` |
| `PDFPreviewError` | PDF failed to render | `owner`, `repo`, `file_path`, `error_type` (corrupt/timeout/unsupported/memory) |
| `PDFMetadataRequested` | CLI `--info` flag used | `owner`, `repo`, `file_path`, `page_count`, `size_bytes` |
| `PDFPreviewTextCopied` | User copies text from PDF viewer | `owner`, `repo`, `file_path`, `text_length` |

### Success Indicators

| Metric | Definition | Target |
|--------|-----------|--------|
| PDF preview adoption | % of PDF file views with rendered preview | > 70% on web |
| PDF diff engagement | % of landing requests with PDF changes where diff is viewed | > 40% |
| PDF search usage | % of PDF previews where search is used | > 15% |
| Download-after-preview rate | % of previews resulting in download | Tracking (lower = better inline experience) |
| Oversized PDF rate | % of views exceeding 50 MB | < 3% |
| Encrypted PDF rate | % of PDF views that are encrypted | Tracking |
| PDF render error rate | % of preview attempts that fail | < 2% |
| Page navigation depth | Median pages viewed per PDF session | > 3 pages |
| PDF format version distribution | Preview views by pdf_version | Tracking |

## Observability

### Logging

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| PDF metadata extracted | `info` | `file_path`, `page_count`, `width`, `height`, `size_bytes`, `encrypted`, `pdf_version`, `title_present`, `author_present`, `extraction_time_ms` | Never log PDF content, title, or author values (may contain PII) |
| PDF metadata extraction failed | `warn` | `file_path`, `extension`, `magic_bytes_hex` (first 8 bytes), `error_message` | Corrupted or non-PDF |
| Magic bytes override extension | `info` | `file_path`, `extension_mime`, `actual_mime`, `magic_bytes_hex` | Data quality signal |
| PDF encrypted detected | `info` | `file_path`, `pdf_version`, `size_bytes` | Encrypted PDFs cannot be previewed |
| PDF metadata extraction timeout | `warn` | `file_path`, `timeout_ms`, `partial_fields_extracted` | Extraction exceeded 2s limit |
| PDF preview served (base64) | `info` | `file_path`, `size_bytes`, `encoding`, `duration_ms` | |
| Oversized PDF skipped | `info` | `file_path`, `size_bytes`, `max_preview_size` | |
| PDF bandwidth limit hit | `warn` | `user_id`, `total_bytes_served`, `limit_bytes`, `window` | |
| PDF title/author sanitized | `debug` | `file_path`, `field`, `original_length`, `sanitized_length` | Control chars or null bytes removed |
| PDF.js client render failure | `warn` | `file_path`, `error_type`, `pdf_version`, `page_count`, `user_agent` | Client-reported via telemetry |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_pdf_preview_requests_total` | Counter | `status`, `client` | Total PDF preview requests |
| `codeplane_pdf_preview_size_bytes` | Histogram | | Size distribution of PDF files |
| `codeplane_pdf_metadata_extraction_duration_seconds` | Histogram | | Metadata extraction time |
| `codeplane_pdf_preview_render_errors_total` | Counter | `error_type` | Client render failures |
| `codeplane_pdf_diff_views_total` | Counter | `change_type` | PDF diff views |
| `codeplane_pdf_bandwidth_bytes_total` | Counter | `encoding` | Bytes served for PDF content |
| `codeplane_pdf_encrypted_total` | Counter | | Encrypted PDFs encountered |
| `codeplane_pdf_page_count` | Histogram | | Distribution of page counts |
| `codeplane_pdf_preview_pages_viewed` | Histogram | | Pages viewed per session |
| `codeplane_pdf_search_queries_total` | Counter | | In-viewer search queries |
| `codeplane_pdf_metadata_extraction_timeouts_total` | Counter | | Extraction timeouts |
| `codeplane_pdf_format_detection_mismatches_total` | Counter | `extension_format`, `actual_format` | Extension vs magic byte mismatches |

### Alerts & Runbooks

**Alert 1: High PDF Metadata Extraction Failure Rate**
- Condition: `rate(codeplane_pdf_preview_requests_total{status="error"}[5m]) / rate(codeplane_pdf_preview_requests_total[5m]) > 0.1`
- Severity: `warning`
- Runbook: (1) Check logs for `PDF metadata extraction failed` entries — `magic_bytes_hex` and `error_message` show the failure context. (2) If format-specific (e.g., all PDF/A or a specific version), check the PDF parsing library for known issues with that variant. (3) If global, check for a regression in `detectPDFMetadata()`. Verify the parsing library version hasn't changed unexpectedly. (4) If repository-specific, may be intentionally non-standard or corrupted files. (5) Check memory and CPU — if p99 extraction time is >1s, the server may be under resource pressure. (6) If the parsing library is crashing, check for known CVEs and update if necessary.

**Alert 2: PDF Metadata Extraction Timeout Spike**
- Condition: `rate(codeplane_pdf_metadata_extraction_timeouts_total[5m]) > 2`
- Severity: `warning`
- Runbook: (1) Check logs for `PDF metadata extraction timeout` entries. The `partial_fields_extracted` field shows what was parsed before timeout. (2) Identify if specific files consistently cause timeouts (degenerate cross-reference tables, extremely large page trees). (3) Check server CPU and I/O load. (4) Consider increasing the timeout from 2s if the server is healthy but files are legitimately complex. (5) If one repository is dominating timeouts, inspect the PDF files in that repo for unusual structure.

**Alert 3: PDF Bandwidth Spike**
- Condition: `rate(codeplane_pdf_bandwidth_bytes_total[5m]) > 200MB/s`
- Severity: `warning`
- Runbook: (1) Check for a single user downloading many large base64 PDFs. (2) Verify bandwidth rate limit configuration is enforced. (3) Check for scraping patterns. (4) Consider lowering the 50 MB threshold if abuse is sustained. (5) Check CDN caching.

**Alert 4: PDF Client Render Error Spike**
- Condition: `rate(codeplane_pdf_preview_render_errors_total[5m]) > 5`
- Severity: `warning`
- Runbook: (1) Check `error_type` breakdown: `corrupt` = server-side or genuinely broken PDFs; `memory` = PDFs too complex for browser; `unsupported` = PDF.js version gap. (2) If `memory` errors dominate, check `codeplane_pdf_page_count` histogram — consider lowering the lazy-load window. (3) If `unsupported` errors correlate with a specific `pdf_version`, check PDF.js release notes. (4) If `corrupt` spikes, verify raw bytes arriving at the client match what jj produces.

**Alert 5: Encrypted PDF Rate Exceeds Threshold**
- Condition: `rate(codeplane_pdf_encrypted_total[1h]) / rate(codeplane_pdf_preview_requests_total[1h]) > 0.3`
- Severity: `info`
- Runbook: (1) Informational — encrypted PDFs are handled gracefully. (2) If the rate is unexpectedly high, check if a specific org or repo is committing many encrypted PDFs. (3) Consider surfacing a user-facing tip about encrypted PDF limitations. (4) No action required unless encrypted detection is malfunctioning.

### Error Cases

| Error Case | Detection | Impact | Mitigation |
|------------|-----------|--------|------------|
| Unrecognized format (no `%PDF-` magic) | Magic byte check fails | Treated as regular binary | Graceful fallback |
| Corrupted PDF (valid header, broken structure) | Parser throws / returns partial | Metadata partially null | Return what was extracted; web shows error + download |
| Encrypted PDF | Parser detects encryption flag | No preview | Info card with download button |
| Metadata extraction timeout (>2s) | Timer exceeded | Partial metadata | Return extracted fields; null for the rest |
| Base64 OOM (large PDF) | 50 MB × 1.33 overhead | Memory pressure | 50 MB limit enforced |
| PDF.js render failure (client) | Worker throws | No visual preview | Error message + download fallback |
| PDF.js OOM (client, large page count) | Browser tab crash | Lost viewer | Lazy page loading limits to ±2 pages |
| PDF with JavaScript | Embedded JS | Security risk | PDF.js `enableScripting: false` blocks execution |
| Malformed cross-reference table | Parser cannot locate pages | page_count null | Partial metadata, web may still render |
| PDF version > parser support | Newer PDF features | Unparseable features | Graceful degradation; version reported, metadata best-effort |

## Verification

### API Integration Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `API-PDF-001` | GET single-page PDF file | `200`, `is_pdf: true`, `is_binary: true`, `format: "pdf"`, `mime_type: "application/pdf"`, `page_count: 1`, `width > 0`, `height > 0`, `encrypted: false`, `preview_available: true` |
| `API-PDF-002` | GET multi-page PDF (24 pages) | `200`, `is_pdf: true`, `page_count: 24` |
| `API-PDF-003` | GET PDF with title and author | `200`, `title` non-null string, `author` non-null string |
| `API-PDF-004` | GET PDF with no title/author metadata | `200`, `title: null`, `author: null` |
| `API-PDF-005` | GET encrypted PDF | `200`, `is_pdf: true`, `encrypted: true`, `page_count: null`, `width: null`, `height: null`, `preview_available: false` |
| `API-PDF-006` | GET PDF with `?encoding=base64` | `200`, `content` is valid base64 decodable to PDF, `encoding: "base64"` |
| `API-PDF-007` | GET PDF with `Accept: application/octet-stream` | `200`, `Content-Type: application/octet-stream`, `Content-Disposition` header present, raw bytes start with `%PDF-` |
| `API-PDF-008` | Non-PDF binary (`.wasm`) | `200`, `is_pdf: false`, `pdf_metadata: null` |
| `API-PDF-009` | Text file (`.ts`) | `200`, `is_pdf: false`, `pdf_metadata: null` |
| `API-PDF-010` | `.pdf` extension with text content | `200`, `is_pdf: false`, `pdf_metadata: null` |
| `API-PDF-011` | `.txt` extension with `%PDF-` magic bytes | `200`, `is_pdf: true`, `format: "pdf"` |
| `API-PDF-012` | Zero-byte `.pdf` file | `200`, `is_pdf: false`, `size: 0` |
| `API-PDF-013` | PDF at exactly 50 MB | `200`, `preview_available: true` |
| `API-PDF-014` | PDF at 50 MB + 1 byte | `200`, `preview_available: false`, `content: null` |
| `API-PDF-015` | Oversized PDF with `?encoding=base64` | `200`, `content: null`, `preview_available: false` |
| `API-PDF-016` | Corrupted PDF (valid magic, truncated body) | `200`, `is_pdf: true`, `page_count: null`, `width: null`, `height: null` |
| `API-PDF-017` | PDF with PDF version 1.4 | `200`, `pdf_version: "1.4"` |
| `API-PDF-018` | PDF with PDF version 2.0 | `200`, `pdf_version: "2.0"` |
| `API-PDF-019` | PDF with Unicode title | `200`, title returned as UTF-8 |
| `API-PDF-020` | PDF with title containing null bytes | `200`, title sanitized (null bytes removed) |
| `API-PDF-021` | PDF with title exceeding 500 chars | `200`, title truncated to 500 characters |
| `API-PDF-022` | PDF with mixed page sizes | `200`, `width` and `height` reflect first page |
| `API-PDF-023` | Change-scoped PDF endpoint | `200`, includes `is_pdf`, `pdf_metadata`, `change_type` |
| `API-PDF-024` | Change-scoped `side=old` modified PDF | `200`, old PDF metadata |
| `API-PDF-025` | Change-scoped `side=old` added PDF | `404` |
| `API-PDF-026` | Change-scoped `side=new` deleted PDF | `200`, `change_type: "deleted"`, `is_pdf: true` |
| `API-PDF-027` | 5 concurrent base64 requests same PDF | All `200`, identical content |
| `API-PDF-028` | Deeply nested PDF path | `200`, `is_pdf: true` |
| `API-PDF-029` | Private repo, anonymous | `401` |
| `API-PDF-030` | Private repo, authorized read | `200`, full metadata |
| `API-PDF-031` | Rate limit (61 anonymous requests) | 61st returns `429` |
| `API-PDF-032` | PDF with 0 pages (degenerate) | `200`, `is_pdf: true`, `page_count: 0`, `preview_available: false` |
| `API-PDF-033` | PDF/A archival variant | `200`, `is_pdf: true`, metadata extracted normally |
| `API-PDF-034` | Linearized (web-optimized) PDF | `200`, `is_pdf: true`, metadata extracted normally |
| `API-PDF-035` | PDF with form fields | `200`, `is_pdf: true`, metadata unaffected |
| `API-PDF-036` | Image file (PNG) not identified as PDF | `200`, `is_pdf: false` |
| `API-PDF-037` | PDF with embedded JavaScript | `200`, `is_pdf: true`, metadata extracted, no script execution |
| `API-PDF-038` | PDF larger than 100 MB with `?encoding=base64` | `200`, `content: null`, `preview_available: false` |

### CLI Integration Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `CLI-PDF-001` | `change cat @ docs/spec.pdf` default | Exit 0, stdout is raw PDF bytes (starts with `%PDF-`) |
| `CLI-PDF-002` | `change cat @ docs/spec.pdf --json` | Exit 0, JSON with `is_pdf: true`, `pdf_metadata` |
| `CLI-PDF-003` | `change cat @ docs/spec.pdf --info` | Exit 0, human-readable: Format, MIME, Pages, Dimensions, Title, Author, Size, Encrypted |
| `CLI-PDF-004` | `change cat @ docs/encrypted.pdf --info` | Exit 0, shows `Encrypted: Yes`, `Pages: Unknown` |
| `CLI-PDF-005` | `change cat @ docs/spec.pdf --json --encoding base64` | Exit 0, base64 content |
| `CLI-PDF-006` | `change cat @ docs/spec.pdf --raw` | Exit 0, raw bytes |
| `CLI-PDF-007` | `change cat @ docs/spec.pdf --info -R owner/repo` | Exit 0, remote info |
| `CLI-PDF-008` | `change cat @ docs/spec.pdf | file -` | `file` outputs "PDF document" |
| `CLI-PDF-009` | `change cat @ nonexistent.pdf --info` | Exit 1, stderr "not found" |
| `CLI-PDF-010` | `change cat @ docs/spec.pdf --info` with no title/author | Exit 0, `Title: (none)`, `Author: (none)` |
| `CLI-PDF-011` | `change cat @ docs/oversized.pdf --info` for >50MB PDF | Exit 0, info includes `Preview: No (file too large)` |

### E2E Playwright Tests (Web UI)

| Test ID | Description | Expected |
|---------|-------------|----------|
| `E2E-PDF-001` | Click single-page PDF in Code Explorer | PDF viewer renders, PDF badge, "1 page" shown |
| `E2E-PDF-002` | Click multi-page PDF in Code Explorer | PDF viewer renders, page count shown, page navigator visible |
| `E2E-PDF-003` | Click next page arrow | Page 2 renders, navigator updates |
| `E2E-PDF-004` | Click previous page arrow | Returns to Page 1 |
| `E2E-PDF-005` | Type page number in navigator input | Jumps to specified page |
| `E2E-PDF-006` | Type page number exceeding total | Jumps to last page |
| `E2E-PDF-007` | Scroll through PDF | Page navigator updates |
| `E2E-PDF-008` | Click Zoom In (+) | PDF renders larger |
| `E2E-PDF-009` | Click Zoom Out (−) | PDF renders smaller |
| `E2E-PDF-010` | Click Fit Page | Page fits within viewport |
| `E2E-PDF-011` | Click Fit Width | Page width matches viewport |
| `E2E-PDF-012` | Click Fullscreen toggle | Viewer enters fullscreen |
| `E2E-PDF-013` | Press Escape in fullscreen | Exits fullscreen |
| `E2E-PDF-014` | Click Search, enter query | Matching text highlighted, count shown |
| `E2E-PDF-015` | Search with no results | "No results" message |
| `E2E-PDF-016` | Click Download | Download initiated, valid PDF |
| `E2E-PDF-017` | Click Open in New Tab | New tab with browser PDF viewer |
| `E2E-PDF-018` | Press `i` key | Info footer toggles |
| `E2E-PDF-019` | Oversized PDF (>50 MB) | "Too large" card with download |
| `E2E-PDF-020` | Oversized PDF: click download | Download works |
| `E2E-PDF-021` | Encrypted PDF | Lock icon, password message, download |
| `E2E-PDF-022` | Encrypted PDF: click download | Download works |
| `E2E-PDF-023` | Corrupted PDF | Error + download button |
| `E2E-PDF-024` | Select text in PDF viewer | Text selection and copy works |
| `E2E-PDF-025` | Switch bookmark with PDF | New PDF loads |
| `E2E-PDF-026` | Landing diff: PDF added | Green "Added" badge, preview |
| `E2E-PDF-027` | Landing diff: PDF deleted | Red "Deleted" badge, metadata, download |
| `E2E-PDF-028` | Landing diff: modified side-by-side | Both viewers render |
| `E2E-PDF-029` | Synchronized scrolling | Scrolling one panel scrolls other |
| `E2E-PDF-030` | Toggle sync off | Panels scroll independently |
| `E2E-PDF-031` | Metadata diff: page count change | Shows old → new with coloring |
| `E2E-PDF-032` | Metadata diff: size change | Red/green coloring |
| `E2E-PDF-033` | Deep link to PDF URL | Viewer loads correctly |
| `E2E-PDF-034` | Private repo unauthenticated | Redirect to login |
| `E2E-PDF-035` | PDF with embedded JavaScript | Renders safely, no execution |
| `E2E-PDF-036` | PDF loading state | Skeleton shimmer before render |
| `E2E-PDF-037` | Keyboard: `←`/`→` page navigation | Pages change |
| `E2E-PDF-038` | Keyboard: `Home`/`End` | Jump to first/last page |
| `E2E-PDF-039` | Keyboard: `+`/`-` zoom | Zoom level changes |
| `E2E-PDF-040` | Keyboard: `Ctrl+F`/`Cmd+F` search | Search bar opens |
| `E2E-PDF-041` | Keyboard: `f` fullscreen | Fullscreen toggles |
| `E2E-PDF-042` | PDF with >200 pages: "Load more" | First 200 pages, load more button |
| `E2E-PDF-043` | PDF with form fields | Forms read-only, no submission |

### TUI Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `TUI-PDF-001` | Select single-page PDF | PDF info card with `PDF` badge, Format, Pages: 1, Dimensions, Size |
| `TUI-PDF-002` | Select multi-page PDF | Shows Pages: 24 |
| `TUI-PDF-003` | Select PDF with title and author | Shows Title and Author fields |
| `TUI-PDF-004` | Select PDF without title/author | Shows Title: (none), Author: (none) |
| `TUI-PDF-005` | Select encrypted PDF | Shows Encrypted: Yes, lock icon |
| `TUI-PDF-006` | Press `d` on PDF | Download initiated |
| `TUI-PDF-007` | Press `y` on PDF | Path copied |
| `TUI-PDF-008` | Press `Y` on PDF | Download URL copied |
| `TUI-PDF-009` | Press `h` on info card | Returns to tree |
| `TUI-PDF-010` | Oversized PDF (>50 MB) | "Too large" + download prompt |
| `TUI-PDF-011` | Corrupted PDF (null metadata) | Shows Pages: Unknown, Dimensions: Unknown |
| `TUI-PDF-012` | Responsive 80×24 terminal | Card fits full-width |
| `TUI-PDF-013` | Responsive 120×40 terminal | Card fits 75% panel |
| `TUI-PDF-014` | Rapid selection PDF↔text file | Correct content type rendered |
| `TUI-PDF-015` | PDF with very long title (>50 chars) | Title truncated with ellipsis |
