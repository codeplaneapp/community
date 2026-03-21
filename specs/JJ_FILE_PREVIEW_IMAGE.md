# JJ_FILE_PREVIEW_IMAGE

Specification for JJ_FILE_PREVIEW_IMAGE.

## High-Level User POV

When a developer browses a jj-native repository on Codeplane and selects an image file from the code explorer, they see a rendered preview of that image directly in the interface rather than a generic "Binary file — preview not available" placeholder. This transforms the repository browsing experience for any project that includes visual assets — logos, icons, screenshots, diagrams, design mockups, or generated charts — from an opaque binary reference into an immediately useful visual.

In the **web UI**, selecting a file like `assets/logo.png` in the code explorer loads a rendered image preview in the right panel. The image displays at a size that fits within the preview area, with the ability to zoom in and out. A header bar shows the file path, file type badge (e.g., "PNG"), file dimensions (e.g., "1200 × 800"), file size (e.g., "142 KB"), and action buttons for raw download and copying the image URL. SVG files render as live vector graphics. Animated GIFs and APNGs play their animation. The preview is tied to the selected jj change ID, so the developer sees the image exactly as it existed at that point in the repository's history — not just the latest version.

In the **TUI**, the experience adapts to terminal capabilities. Terminals that support the Kitty graphics protocol or Sixel receive an inline image render scaled to the preview pane. Terminals without graphics support see a rich metadata card showing the image type, dimensions, file size, and a color palette summary, plus a prompt to open the image in the system's default viewer. In all cases, the header bar shows the file type badge, dimensions, and size.

In the **CLI**, `codeplane change cat @ assets/logo.png` streams raw image bytes to stdout, allowing developers to pipe the image to other tools (e.g., `| feh -` or `| imgcat`). The `--json` flag returns structured metadata including dimensions, MIME type, and base64-encoded content. The `--open` flag opens the image in the system's default viewer.

In **editor integrations**, VS Code and Neovim can display image previews inline using their native image rendering capabilities when browsing files from other changes.

The value is context without context-switching. Designers, frontend developers, documentation authors, and anyone reviewing agent-generated visual output can understand what an image looks like without downloading it, checking it out locally, or leaving the forge. Because Codeplane uses stable jj change IDs, a link to an image at a specific change remains valid across rebases and history rewrites, making it reliable for embedding in landing request reviews, issue comments, and wiki pages.

## Acceptance Criteria

### Definition of Done

- [ ] Image files are detected by MIME type derived from file extension (png, jpg, jpeg, gif, webp, svg, ico, bmp, avif, apng, tiff).
- [ ] The existing `GET /api/repos/:owner/:repo/file/:change_id/*` endpoint returns image-specific metadata when `is_binary: true` and the file has a recognized image extension.
- [ ] The response includes additional fields: `mime_type`, `width`, `height` (for raster formats where dimension extraction is feasible), and `is_image: true`.
- [ ] The `?encoding=base64` query parameter returns base64-encoded image content suitable for rendering as a data URI in the browser.
- [ ] The `Accept: application/octet-stream` raw download path returns the image with the correct `Content-Type` header (e.g., `image/png`) instead of generic `application/octet-stream`.
- [ ] The web UI Code Explorer renders an inline image preview for recognized image files, replacing the "Binary file — preview not available" placeholder.
- [ ] The web UI image preview includes zoom controls (fit-to-panel, 1:1 actual size, zoom in, zoom out), a checkerboard transparency background for PNGs/SVGs with alpha, and dimension/size metadata in the header bar.
- [ ] SVG files render as live inline SVG in the web UI with sanitization to prevent script execution.
- [ ] Animated GIFs and APNGs play their animation in the web UI preview.
- [ ] The TUI renders image previews using Kitty graphics protocol or Sixel when the terminal supports it, falling back to a metadata card with download/open affordances.
- [ ] The CLI supports `--open` flag to open image files in the system's default image viewer.
- [ ] The `useFileContent` hook in `@codeplane/ui-core` is extended to expose `is_image`, `mime_type`, `width`, and `height` from the API response.
- [ ] Image files exceeding 25 MB are not rendered inline; a download-only experience is shown.
- [ ] E2E tests cover all supported image formats, edge cases, and all client surfaces.
- [ ] API documentation, CLI reference, and user guide sections are updated to cover image preview.

### Functional Constraints

- [ ] Supported image extensions and their MIME types:
  - `.png` → `image/png`
  - `.jpg`, `.jpeg` → `image/jpeg`
  - `.gif` → `image/gif`
  - `.webp` → `image/webp`
  - `.svg` → `image/svg+xml`
  - `.ico` → `image/x-icon`
  - `.bmp` → `image/bmp`
  - `.avif` → `image/avif`
  - `.apng` → `image/apng`
  - `.tiff`, `.tif` → `image/tiff`
- [ ] Extension matching is case-insensitive (`.PNG`, `.Jpg`, `.SVG` all detected).
- [ ] Files with image extensions are still flagged `is_binary: true` (they are binary), but additionally flagged `is_image: true`.
- [ ] SVG files are an exception: they are text-based, so `is_binary` may be `false` for SVGs, but `is_image` is `true` regardless.
- [ ] The `mime_type` field is always populated for recognized image files.
- [ ] The `width` and `height` fields are populated for PNG, JPEG, GIF, WebP, BMP, and ICO by reading image header bytes (not decoding the full image). For SVG, `width` and `height` are extracted from the root `<svg>` element's `width`/`height` or `viewBox` attributes if present; `null` if absent. For formats where header parsing fails or is unsupported (TIFF, AVIF), `width` and `height` are `null`.
- [ ] Dimension extraction must not load the entire image into memory — only the first 64 KB of the file is read for header parsing.
- [ ] Image content served via `?encoding=base64` must be the complete file content, not truncated at 5 MB. The 5 MB truncation from JJ_FILE_PREVIEW_TEXT applies only to text content; images up to 25 MB are served in full via base64.
- [ ] Images larger than 25 MB return `is_image: true` with `content: null` even when `?encoding=base64` is requested, along with `is_oversized: true`.
- [ ] Raw download (`Accept: application/octet-stream`) for images uses the actual MIME type in `Content-Type` (e.g., `image/png`), not `application/octet-stream`. The `Content-Disposition` header is `inline` (not `attachment`) to allow browser-native image display.
- [ ] SVG content served in JSON responses (default `encoding=utf8`) returns the raw SVG text in the `content` field with `is_binary: false` and `is_image: true`.
- [ ] SVG files served via raw download include `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` to prevent script execution.
- [ ] The `owner`, `repo`, `change_id`, and file path parameters follow all constraints defined in JJ_FILE_PREVIEW_TEXT (regex patterns, length limits, path traversal rejection, etc.).
- [ ] A file with a recognized image extension but corrupted/invalid image content (e.g., a `.png` file containing plain text) returns `is_image: true` with `width: null`, `height: null`. The web UI attempts to render it and shows an "Unable to render image" fallback if the browser cannot decode it.
- [ ] Zero-byte files with image extensions return `is_image: true`, `size: 0`, `width: null`, `height: null`, `content: null`.
- [ ] Files with double extensions (e.g., `image.png.bak`) are not treated as images — only the final extension is checked.
- [ ] Files without extensions are never treated as images, regardless of content.

### Edge Cases

- [ ] Image with extremely large dimensions (e.g., 50,000 × 50,000 pixels, small file size due to compression) — the web UI must not attempt to render this in a canvas/element that causes OOM. If `width * height > 100,000,000` (100 megapixels), show a warning: "Image too large to preview (50000 × 50000) — download to view" with download link.
- [ ] Image at exactly 25 MB — served in full. Image at 25 MB + 1 byte — `is_oversized: true`, download only.
- [ ] SVG containing `<script>` tags — rendered safely (scripts stripped by DOMPurify sanitization in the web UI; served with restrictive CSP headers for raw download).
- [ ] SVG containing external resource references (`<image href="https://...">`) — sanitized to remove external references in inline rendering.
- [ ] SVG with no `width`/`height`/`viewBox` — renders using browser intrinsic sizing; `width: null`, `height: null` in response.
- [ ] JPEG with EXIF orientation metadata — the web UI renders with correct orientation (browsers handle this natively via `image-orientation: from-image`).
- [ ] Animated GIF with hundreds of frames — plays in the web UI; the UI does not provide frame scrubbing, just play/pause.
- [ ] ICO file containing multiple resolutions — the browser's native `<img>` rendering selects the appropriate resolution.
- [ ] WebP file that is animated — plays animation in the web UI.
- [ ] Corrupted image header (cannot parse dimensions) — `width: null`, `height: null`, still attempts render.
- [ ] Case sensitivity: `LOGO.PNG`, `logo.Png`, `LOGO.png` all detected as images.
- [ ] File named exactly `.png` (no basename) — treated as image based on extension.
- [ ] Path `assets/images/` (trailing slash, no file) — returns `400` (same behavior as JJ_FILE_PREVIEW_TEXT).

## Design

### API Shape

**Endpoint**: Same as JJ_FILE_PREVIEW_TEXT — `GET /api/repos/:owner/:repo/file/:change_id/*`

This feature extends the existing file content API response rather than introducing a new endpoint. When the file at the given path has a recognized image extension, the response includes additional image-specific fields.

**Extended Response (200 OK, image file, default encoding)**:
```json
{
  "path": "assets/logo.png",
  "content": null,
  "encoding": "utf8",
  "language": null,
  "size": 45231,
  "line_count": 0,
  "is_binary": true,
  "is_truncated": false,
  "is_image": true,
  "is_oversized": false,
  "mime_type": "image/png",
  "width": 1200,
  "height": 800
}
```

**Extended Response (200 OK, image file, `?encoding=base64`)**:
```json
{
  "path": "assets/logo.png",
  "content": "iVBORw0KGgoAAAANSUhEUgAA...",
  "encoding": "base64",
  "language": null,
  "size": 45231,
  "line_count": 0,
  "is_binary": true,
  "is_truncated": false,
  "is_image": true,
  "is_oversized": false,
  "mime_type": "image/png",
  "width": 1200,
  "height": 800
}
```

**Extended Response (200 OK, SVG file, default encoding)**:
```json
{
  "path": "assets/diagram.svg",
  "content": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\">...</svg>",
  "encoding": "utf8",
  "language": "svg",
  "size": 3201,
  "line_count": 42,
  "is_binary": false,
  "is_truncated": false,
  "is_image": true,
  "is_oversized": false,
  "mime_type": "image/svg+xml",
  "width": 100,
  "height": 100
}
```

**Extended Response (200 OK, oversized image)**:
```json
{
  "path": "assets/huge-photo.jpg",
  "content": null,
  "encoding": "utf8",
  "language": null,
  "size": 26214401,
  "line_count": 0,
  "is_binary": true,
  "is_truncated": false,
  "is_image": true,
  "is_oversized": true,
  "mime_type": "image/jpeg",
  "width": 8000,
  "height": 6000
}
```

**Raw Image Download**: When `Accept: application/octet-stream` (or `Accept: image/*`) is sent, the response uses:
- `Content-Type`: actual MIME type (e.g., `image/png`)
- `Content-Disposition: inline; filename="logo.png"`
- `X-Content-Type-Options: nosniff`
- For SVG: additionally `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:`

Non-image files continue to behave exactly as specified in JJ_FILE_PREVIEW_TEXT. The `is_image`, `mime_type`, `width`, and `height` fields are omitted (or `is_image: false`) for non-image files.

---

### SDK Shape

The existing `FileContentResponse` interface is extended:

```typescript
interface FileContentResponse {
  path: string;
  content: string | null;
  encoding: "utf8" | "base64";
  language: string | null;
  size: number;
  line_count: number;
  is_binary: boolean;
  is_truncated: boolean;
  // New image fields
  is_image: boolean;
  is_oversized: boolean;
  mime_type: string | null;
  width: number | null;
  height: number | null;
}
```

A new utility function is added to the SDK:

```typescript
function detectImageType(filePath: string): { isImage: boolean; mimeType: string | null }
```

A new utility function for header-only dimension extraction:

```typescript
async function extractImageDimensions(
  content: Buffer,
  mimeType: string
): Promise<{ width: number | null; height: number | null }>
```

The shared `useFileContent` hook in `@codeplane/ui-core` already returns the full `FileContentResponse`; no hook signature change is needed. A convenience derived accessor is added:

```typescript
function useImagePreview(
  owner: string,
  repo: string,
  changeId: string,
  filePath: string
): {
  data: FileContentResponse | undefined;
  imageUrl: string | undefined; // Computed data URI or raw URL
  error: APIError | undefined;
  isLoading: boolean;
  isImage: boolean;
  isOversized: boolean;
  refetch: () => void;
}
```

---

### Web UI Design

The image preview replaces the "Binary file — preview not available" placeholder in the Code Explorer right panel when `is_image: true`.

**Image Header Bar** (same position as text file header):
- File path with breadcrumb segments
- File type badge (e.g., "PNG", "SVG", "GIF") using the MIME type, styled in a muted pill
- Dimensions: "1200 × 800" (or "unknown" if null)
- File size: "142 KB" in human-readable format
- **"Raw"** button — opens raw image URL in new tab (using `Accept: image/*`)
- **"Copy URL"** button — copies the raw image URL to clipboard
- **"Download"** button — triggers `Content-Disposition: attachment` download

**Image Content Area**:
1. **Background**: Checkerboard transparency pattern (light/dark squares, 8px each) for images with alpha channels (PNG, WebP, SVG, GIF). Solid neutral background for opaque formats (JPEG, BMP).
2. **Image element**: `<img>` for raster formats, inline `<svg>` (sanitized via DOMPurify) for SVG.
3. **Fit behavior**: Default is "fit to panel" — the image scales to fit the preview area while maintaining aspect ratio, with padding.
4. **Zoom controls toolbar** (bottom-right floating):
   - "Fit" button (default) — scales to fit panel
   - "1:1" button — actual pixel size, scrollable if larger than panel
   - "+" zoom in (increments: 25%, 50%, 75%, 100%, 150%, 200%, 300%, 400%)
   - "−" zoom out
   - Current zoom percentage displayed (e.g., "50%")
   - Mouse wheel zooms in/out centered on cursor position
5. **Pan**: When zoomed beyond panel size, click-and-drag to pan. Cursor changes to grab/grabbing.
6. **Animated images** (GIF, APNG, animated WebP): Play automatically. No explicit play/pause control in v1.
7. **Oversized images** (`is_oversized: true`): Show metadata card — type badge, dimensions, size — with "Download" button. No inline render.
8. **Megapixel-limited images** (width × height > 100M pixels): Show warning: "Image too large to preview (50000 × 50000) — download to view" with download link. Prevents browser OOM.
9. **Corrupted/unrenderable images**: The `<img>` `onerror` handler fires. Show fallback: "Unable to render image" with file type badge, dimensions (if available), size, and "Download" button.
10. **SVG rendering**: Sanitized with DOMPurify, removing `<script>`, `on*` event handlers, and external resource references. Rendered inline as DOM elements. `viewBox` respected for sizing.

**Loading state**: Centered spinner with muted "Loading image…" text.
**Error state**: Same error/retry pattern as text file preview.

**Diff View Integration**: When viewing a change diff that modifies an image file, the diff view shows a side-by-side image comparison:
- Left panel: old image (at parent change)
- Right panel: new image (at current change)
- A "swipe" slider allows overlaying old/new
- Below the images: size delta (e.g., "+2.3 KB") and dimension delta if changed

---

### TUI UI

The TUI image preview occupies the same right panel as the text file preview in the code explorer.

**Header Bar**: File path, type badge (e.g., "PNG"), dimensions ("1200×800"), size ("142 KB"). If dimensions are unknown, omit the dimension field.

**Content Area** (capability detection):

1. **Kitty graphics protocol** (detected via `TERM_PROGRAM=kitty` or `TERM` containing `kitty`, or queried via escape sequence):
   - Image rendered inline using Kitty's `\e_G` escape sequences.
   - Scaled to fit the preview pane dimensions.
   - On file change, previous image is cleared before rendering new one.

2. **Sixel** (detected via `TERM` containing `sixel` or DA1 query response):
   - Image rendered inline using Sixel escape sequences.
   - Scaled to fit pane.

3. **iTerm2 inline images** (detected via `TERM_PROGRAM=iTerm.app`):
   - Image rendered using iTerm2's proprietary `\e]1337;File=` sequence.

4. **No graphics support** (fallback):
   - Rich metadata card showing image type, dimensions, size.
   - Prompt to press `o` to open in system viewer.

**Keyboard shortcuts** (additions to file preview):

| Key | Action |
|-----|--------|
| `o` | Open image in system default viewer |
| `y` | Copy file path to clipboard |
| `Y` | Copy raw image URL to clipboard |
| `i` | Show/hide image info overlay |
| `t` | Toggle text view for SVGs (syntax-highlighted source) |
| `q` | Pop code explorer screen |
| `?` | Show help overlay |

---

### CLI Command

**Command**: Same as JJ_FILE_PREVIEW_TEXT — `codeplane change cat <change_id> <path>`

**Image-specific options**:

| Flag | Description |
|------|-------------|
| `--open` | Open image in system default viewer after download |
| `--info` | Print image metadata only (dimensions, MIME type, size) without content |

**Behavior**:
- **Default** (no flags): Raw image bytes to stdout. Suitable for piping.
- **`--json`**: Structured `FileContentResponse` with all image fields.
- **`--open`**: Downloads image to temp file and opens with `xdg-open` (Linux) or `open` (macOS).
- **`--info`**: Prints human-readable metadata:
  ```
  Type: PNG (image/png)
  Dimensions: 1200 × 800
  Size: 142.0 KB
  Path: assets/logo.png
  Change: ksqxyz
  ```

**Examples**:
```bash
codeplane change cat @ assets/logo.png --info
codeplane change cat @ assets/logo.png --open
codeplane change cat @ assets/logo.png | imgcat
codeplane change cat @ assets/logo.png --json --encoding base64
codeplane change cat @ assets/logo.png | wl-copy --type image/png
```

---

### Documentation

1. **API Reference — File Content at Change** (`docs/api/file-content.mdx`): Add "Image Files" section with `is_image`, `mime_type`, `width`, `height`, `is_oversized` fields. Request/response examples for PNG, SVG, oversized, and corrupted images. Document raw image download with correct `Content-Type`. Document 25 MB limit.

2. **Repository Guide** (`docs/guides/repositories.mdx`): Add "Previewing Images" subsection under "Code Browsing". Cover supported formats, zoom, transparency backgrounds, SVG security model, and image diff comparison.

3. **CLI Reference** (`docs/cli/change.mdx`): Document `--open` and `--info` flags. Add piping examples for terminal image viewers and clipboard.

4. **TUI Guide** (`docs/guides/tui.mdx`): Document image preview, terminal detection, `o` key, and which terminals support inline rendering.

## Permissions & Security

### Authorization Matrix

| Role | Public Repository | Private Repository |
|------|---------------------|--------------------|
| **Anonymous** | ✅ Read | ❌ 401 |
| **Authenticated (no repo access)** | ✅ Read | ❌ 403 |
| **Repository Read** | ✅ Read | ✅ Read |
| **Repository Write** | ✅ Read | ✅ Read |
| **Repository Admin** | ✅ Read | ✅ Read |
| **Owner** | ✅ Read | ✅ Read |
| **Org Member (team read)** | ✅ Read | ✅ Read |
| **Deploy Key (read)** | ✅ Read (via SSH/API) | ✅ Read (via SSH/API) |

This is a **read-only** feature. The authorization model is identical to JJ_FILE_PREVIEW_TEXT. Image preview does not introduce any new write or mutation path.

### Rate Limiting

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 60 requests | per hour, per IP |
| Authenticated user | 5,000 requests | per hour, per token/session |
| Deploy key | 5,000 requests | per hour, per key |
| Agent session | 10,000 requests | per hour, per session |

Rate limits are identical to JJ_FILE_PREVIEW_TEXT since they share the same endpoint. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) included in all responses. `429` responses include `Retry-After`. The 25 MB image cap naturally bounds response sizes.

### Data Privacy & Security

- **SVG XSS prevention**: SVGs can contain `<script>` tags, `on*` event attributes, `<foreignObject>` with arbitrary HTML, and external resource references. Mitigations:
  - **Web UI inline rendering**: SVG content sanitized using DOMPurify with `FORBID_TAGS: ['script', 'foreignObject']` and `FORBID_ATTR: [all 'on*' attributes]`. External references removed.
  - **Raw SVG download**: Served with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:` and `X-Content-Type-Options: nosniff`.
  - **JSON response**: SVG content in `content` field is raw text — no sanitization in the API. Sanitization is a client responsibility.
- **Content-Type sniffing**: All raw image downloads include `X-Content-Type-Options: nosniff`.
- **No server-side image processing**: The server does not decode, resize, or transcode images. Dimension extraction reads only header bytes. This eliminates image-parsing CVE attack surfaces.
- **Path traversal**: Same prevention as JJ_FILE_PREVIEW_TEXT.
- **PII in EXIF**: JPEG files may contain EXIF metadata including GPS coordinates, camera serial numbers, and timestamps. The API serves the file as-is (consistent with every forge). No EXIF stripping is performed. Documented as user responsibility.
- **Temp file cleanup** (CLI `--open`): Temp files written to OS temp directory with restricted permissions (`0600`) and cleaned up on CLI process exit via shutdown hook.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ImagePreviewRendered` | Web UI or TUI successfully renders an image preview | `owner`, `repo`, `change_id`, `file_path`, `mime_type`, `width`, `height`, `size_bytes`, `is_animated`, `client` (`web`/`tui`), `render_method` (`img`/`svg_inline`/`kitty`/`sixel`/`iterm`/`fallback`), `load_time_ms` |
| `ImagePreviewFailed` | Image preview attempted but failed to render | `owner`, `repo`, `change_id`, `file_path`, `mime_type`, `size_bytes`, `failure_reason` (`corrupt`/`oversized`/`megapixel_limit`/`network`/`unknown`), `client` |
| `ImagePreviewZoomed` | User uses zoom controls | `owner`, `repo`, `file_path`, `zoom_level`, `zoom_action` (`fit`/`actual`/`in`/`out`/`wheel`), `client` |
| `ImagePreviewDownloaded` | User downloads an image via raw URL or download button | `owner`, `repo`, `change_id`, `file_path`, `mime_type`, `size_bytes`, `client` |
| `ImagePreviewOpened` | CLI `--open` or TUI `o` key to open in system viewer | `owner`, `repo`, `file_path`, `mime_type`, `client` (`cli`/`tui`) |
| `ImagePreviewInfoViewed` | CLI `--info` metadata query | `owner`, `repo`, `file_path`, `mime_type`, `width`, `height`, `size_bytes` |
| `ImageDiffViewed` | User views image diff in landing request review | `owner`, `repo`, `landing_id`, `file_path`, `mime_type`, `old_size_bytes`, `new_size_bytes`, `client` |
| `ImagePreviewSVGSanitized` | SVG content was sanitized (script/event handlers removed) | `owner`, `repo`, `file_path`, `sanitized_elements_count` |

### Funnel Metrics & Success Indicators

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Image preview adoption** | % of image file views that result in rendered preview (vs. download-only) | > 90% (excludes oversized) |
| **Image preview load latency (p50/p95)** | Time from request to rendered image | p50 < 800ms, p95 < 3s |
| **Format distribution** | Breakdown of previewed images by MIME type | Tracking only |
| **Zoom engagement** | % of image preview sessions where zoom is used | > 20% |
| **Download rate** | % of image previews that lead to a download action | Tracking only |
| **SVG sanitization rate** | % of SVG files that had content removed during sanitization | Tracking only (security signal) |
| **Render failure rate** | % of image preview attempts that fail | < 3% |
| **Image diff usage** | % of landing request reviews with image diffs that view the image comparison | > 50% |
| **CLI --open usage** | % of CLI image file views that use --open | Tracking only |
| **Oversized encounter rate** | % of image file views that are oversized (>25 MB) | < 1% |

## Observability

### Logging

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Image file detected | `debug` | `owner`, `repo`, `change_id`, `file_path`, `mime_type`, `size_bytes` | Fires when extension matches image type |
| Image dimensions extracted | `debug` | `owner`, `repo`, `file_path`, `width`, `height`, `extraction_method` (`header_parse`/`svg_attr`), `extraction_ms` | Track parsing performance |
| Image dimension extraction failed | `warn` | `owner`, `repo`, `file_path`, `mime_type`, `error` | Corrupted header or unsupported format |
| Image content served (base64) | `info` | `owner`, `repo`, `change_id`, `file_path`, `mime_type`, `size_bytes`, `duration_ms` | Large response; track for performance |
| Raw image download served | `info` | `owner`, `repo`, `change_id`, `file_path`, `mime_type`, `size_bytes`, `duration_ms` | Track separately from JSON responses |
| Oversized image rejected | `info` | `owner`, `repo`, `file_path`, `size_bytes`, `limit_bytes` | User hit the 25 MB limit |
| SVG sanitization applied | `info` | `owner`, `repo`, `file_path`, `removed_tags_count`, `removed_attrs_count` | Security-relevant |
| SVG with script content detected | `warn` | `owner`, `repo`, `file_path`, `user_id` | Potential attack vector; correlate with user |

All logs are structured JSON. Image content (base64 or bytes) is **never** included in any log line.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_image_preview_requests_total` | Counter | `mime_type`, `client` (web/cli/tui/api/agent), `status` (2xx/4xx/5xx) | Total image preview requests |
| `codeplane_image_preview_duration_seconds` | Histogram | `mime_type`, `encoding` (utf8/base64/raw) | End-to-end request duration (buckets: 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_image_preview_size_bytes` | Histogram | `mime_type` | Size distribution of served images (buckets: 10KB, 100KB, 500KB, 1MB, 5MB, 10MB, 25MB) |
| `codeplane_image_dimension_extraction_duration_seconds` | Histogram | `mime_type` | Time to extract dimensions from image headers |
| `codeplane_image_dimension_extraction_failures_total` | Counter | `mime_type` | Failed dimension extractions |
| `codeplane_image_oversized_total` | Counter | `mime_type` | Images exceeding 25 MB limit |
| `codeplane_svg_sanitization_total` | Counter | `action` (`clean`/`script_removed`/`event_removed`/`external_removed`) | SVG sanitization actions |
| `codeplane_image_render_failures_total` | Counter | `mime_type`, `client`, `failure_reason` | Client-side render failures (reported via telemetry) |
| `codeplane_image_preview_web_load_time_seconds` | Histogram | `mime_type` | Client-side image load time in web UI (buckets: 0.1, 0.25, 0.5, 1, 2, 5) |

### Alerts & Runbooks

**Alert 1: High Image Dimension Extraction Failure Rate**
- **Condition**: `rate(codeplane_image_dimension_extraction_failures_total[5m]) / rate(codeplane_image_preview_requests_total[5m]) > 0.2`
- **Severity**: `warning`
- **Runbook**:
  1. Check which `mime_type` label is failing most. Dimension extraction may not be implemented for all formats.
  2. If a specific format (e.g., AVIF) is failing, verify the header parsing logic handles that format.
  3. Check if users are uploading files with image extensions but non-image content. Query logs for `Image dimension extraction failed`.
  4. If a known image format is failing, sample a file from the repository using `jj file show` and inspect the header bytes manually.
  5. If the rate is localized to one repository, investigate if that repo has unusual binary files with misleading extensions.

**Alert 2: SVG Script Content Spike**
- **Condition**: `increase(codeplane_svg_sanitization_total{action="script_removed"}[1h]) > 20`
- **Severity**: `critical`
- **Runbook**:
  1. This indicates SVG files with `<script>` tags are being committed. While sanitization prevents XSS, this may indicate a supply-chain attack attempt.
  2. Query logs for `SVG with script content detected` entries and extract `owner`, `repo`, `user_id`.
  3. Review the specific SVG files — are they legitimate (e.g., D3.js-generated SVGs) or malicious?
  4. If a single user account is committing many SVGs with scripts, review the account for compromise.
  5. Verify DOMPurify sanitization is working by inspecting rendered output in a sandboxed browser.
  6. Confirm CSP headers on raw SVG downloads are being served correctly.
  7. Escalate to security team if the pattern suggests targeted XSS attempts.

**Alert 3: Image Preview Latency p95 > 5s**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_image_preview_duration_seconds_bucket[5m])) > 5`
- **Severity**: `warning`
- **Runbook**:
  1. Check `codeplane_image_preview_size_bytes` histogram — are large images (>5 MB) dominating?
  2. Check if the bottleneck is `jj file show` (subprocess time) or base64 encoding (CPU).
  3. For base64 responses, large files naturally take longer. Check if p95 is driven by a few very large images.
  4. Check disk I/O with `iostat`.
  5. Check for concurrent requests to large images from the same repository.
  6. Consider if the 25 MB limit should be lowered for base64 encoding specifically.

**Alert 4: Sustained Image 5xx Rate > 5%**
- **Condition**: `rate(codeplane_image_preview_requests_total{status="5xx"}[5m]) / rate(codeplane_image_preview_requests_total[5m]) > 0.05`
- **Severity**: `critical`
- **Runbook**:
  1. Check server error logs — is this the same root cause as general file content 5xx?
  2. If image-specific, check if dimension extraction is causing crashes.
  3. Check for OOM conditions — base64 encoding of 25 MB files uses significant memory.
  4. Verify jj binary health: `jj version`.
  5. Check Bun runtime health — large buffer allocations may trigger GC pressure.
  6. If localized to specific repos, inspect those repos for unusual files.
  7. Restart server if all checks pass.

**Alert 5: Oversized Image Rate Unexpectedly High**
- **Condition**: `rate(codeplane_image_oversized_total[1h]) / rate(codeplane_image_preview_requests_total[1h]) > 0.1`
- **Severity**: `info`
- **Runbook**:
  1. More than 10% of image requests are hitting the 25 MB limit.
  2. Check which repositories and file types are contributing.
  3. Survey the size distribution using `codeplane_image_preview_size_bytes` histogram.
  4. Consider implementing progressive/thumbnail rendering for large images in a future iteration.

### Error Cases & Failure Modes

| Error Case | HTTP Status | Detection | Impact | Mitigation |
|------------|-------------|-----------|--------|------------|
| Image extension but non-image content | 200 | `is_image: true`, but client render fails | Single file | Client shows "Unable to render" fallback |
| Corrupted image header | 200 | `width: null`, `height: null` | Metadata missing | Serve file, let client attempt render |
| Image > 25 MB | 200 | `is_oversized: true` | No inline preview | Download-only experience |
| Image > 100 megapixels | 200 | `width * height > 100M` | Client-side OOM risk | Client checks dimensions before rendering |
| SVG with malicious content | 200 | Sanitization applied | No impact (sanitized) | DOMPurify + CSP headers |
| SVG with external references | 200 | Sanitization removes externals | Missing referenced images | Expected; documented |
| jj file show fails on binary | 500 | Subprocess error | No content | Same mitigation as JJ_FILE_PREVIEW_TEXT |
| Base64 encoding OOM on large image | 500 | Bun crash or OOM | Single request | 25 MB cap prevents most cases |
| TIFF/AVIF dimension extraction unsupported | 200 | `width: null`, `height: null` | Metadata incomplete | Documented |
| Temp file creation fails (CLI --open) | CLI exit 1 | OS permission or disk error | Single CLI invocation | stderr error message |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-FPI-001` | `GET .../file/:change_id/assets/logo.png` for a known PNG file | `200`, `is_image: true`, `is_binary: true`, `mime_type: "image/png"`, `width > 0`, `height > 0`, `content: null` |
| `API-FPI-002` | `GET .../file/:change_id/photo.jpg` for a known JPEG file | `200`, `is_image: true`, `mime_type: "image/jpeg"`, `width > 0`, `height > 0` |
| `API-FPI-003` | `GET .../file/:change_id/animation.gif` for a known GIF file | `200`, `is_image: true`, `mime_type: "image/gif"`, `width > 0`, `height > 0` |
| `API-FPI-004` | `GET .../file/:change_id/modern.webp` for a known WebP file | `200`, `is_image: true`, `mime_type: "image/webp"`, `width > 0`, `height > 0` |
| `API-FPI-005` | `GET .../file/:change_id/diagram.svg` for a known SVG file | `200`, `is_image: true`, `is_binary: false`, `mime_type: "image/svg+xml"`, content is raw SVG text, `language: "svg"` |
| `API-FPI-006` | `GET .../file/:change_id/favicon.ico` for a known ICO file | `200`, `is_image: true`, `mime_type: "image/x-icon"` |
| `API-FPI-007` | `GET .../file/:change_id/legacy.bmp` for a known BMP file | `200`, `is_image: true`, `mime_type: "image/bmp"`, `width > 0`, `height > 0` |
| `API-FPI-008` | `GET .../file/:change_id/next-gen.avif` for a known AVIF file | `200`, `is_image: true`, `mime_type: "image/avif"` (width/height may be null) |
| `API-FPI-009` | `GET .../file/:change_id/assets/logo.png?encoding=base64` | `200`, `encoding: "base64"`, `content` is valid base64, decoding yields valid PNG bytes |
| `API-FPI-010` | `GET .../file/:change_id/diagram.svg?encoding=base64` | `200`, `encoding: "base64"`, `content` is base64-encoded SVG text |
| `API-FPI-011` | PNG raw download with `Accept: application/octet-stream` | `200`, `Content-Type: image/png`, `Content-Disposition: inline; filename="logo.png"`, body is valid PNG |
| `API-FPI-012` | SVG raw download with `Accept: application/octet-stream` | `200`, `Content-Type: image/svg+xml`, `Content-Security-Policy` header present |
| `API-FPI-013` | `GET .../file/:change_id/LOGO.PNG` (uppercase extension) | `200`, `is_image: true`, `mime_type: "image/png"` |
| `API-FPI-014` | `GET .../file/:change_id/Icon.Jpg` (mixed-case extension) | `200`, `is_image: true`, `mime_type: "image/jpeg"` |
| `API-FPI-015` | `GET .../file/:change_id/src/main.ts` (non-image file) | `200`, `is_image: false`, `mime_type: null` |
| `API-FPI-016` | `GET .../file/:change_id/image.png.bak` (double extension) | `200`, `is_image: false` — `.bak` is the final extension |
| `API-FPI-017` | `GET .../file/:change_id/empty.png` (zero-byte PNG) | `200`, `is_image: true`, `size: 0`, `width: null`, `height: null`, `content: null` |
| `API-FPI-018` | `GET .../file/:change_id/fake.png` (PNG extension, text content) | `200`, `is_image: true`, `mime_type: "image/png"`, `width: null`, `height: null` |
| `API-FPI-019` | PNG at exactly 25 MB with `?encoding=base64` | `200`, `is_oversized: false`, full base64 content returned |
| `API-FPI-020` | PNG at 25 MB + 1 byte with `?encoding=base64` | `200`, `is_oversized: true`, `content: null` |
| `API-FPI-021` | PNG at 25 MB + 1 byte with default encoding | `200`, `is_oversized: true`, `content: null`, `is_binary: true` |
| `API-FPI-022` | SVG containing `<script>alert('xss')</script>` — JSON response | `200`, raw SVG content returned unsanitized in `content` field |
| `API-FPI-023` | SVG with `<script>` — raw download | `200`, `Content-Security-Policy` header blocks script execution |
| `API-FPI-024` | SVG with `viewBox="0 0 200 100"` but no width/height attrs | `200`, `width: 200`, `height: 100` |
| `API-FPI-025` | SVG with no viewBox, no width, no height | `200`, `width: null`, `height: null` |
| `API-FPI-026` | SVG with `width="100%"` (percentage) | `200`, `width: null`, `height: null` |
| `API-FPI-027` | `GET .../file/:change_id/photo.tiff` for a TIFF file | `200`, `is_image: true`, `mime_type: "image/tiff"` |
| `API-FPI-028` | `GET .../file/:change_id/anim.apng` for an APNG file | `200`, `is_image: true`, `mime_type: "image/apng"` |
| `API-FPI-029` | Non-image file does NOT include `mime_type` | Verified: `mime_type: null` or field absent |
| `API-FPI-030` | Raw image download with `Accept: image/*` | `200`, correct `Content-Type` |
| `API-FPI-031` | `X-Content-Type-Options: nosniff` on all raw image downloads | Header present |
| `API-FPI-032` | Private repo image, anonymous request | `401` |
| `API-FPI-033` | Private repo image, authenticated with read access | `200`, `is_image: true` |
| `API-FPI-034` | Path traversal with image extension | `400`, path traversal rejected |
| `API-FPI-035` | File named `.png` (just extension) | `200`, `is_image: true` if exists |
| `API-FPI-036` | 10 concurrent requests for same large (5 MB) image | All `200` with identical content |
| `API-FPI-037` | SVG file at 5 MB (text, under 25 MB limit) | `200`, `is_truncated: false` |
| `API-FPI-038` | Image file with `?encoding=invalid` | `400` |
| `API-FPI-039` | Known PNG (100×50 fixture) — verify exact dimensions | `width: 100`, `height: 50` |
| `API-FPI-040` | Known JPEG (640×480 fixture) — verify exact dimensions | `width: 640`, `height: 480` |
| `API-FPI-041` | Known GIF (200×200 fixture) — verify exact dimensions | `width: 200`, `height: 200` |
| `API-FPI-042` | Known WebP (320×240 fixture) — verify exact dimensions | `width: 320`, `height: 240` |
| `API-FPI-043` | Known BMP (64×64 fixture) — verify exact dimensions | `width: 64`, `height: 64` |

### CLI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CLI-FPI-001` | `codeplane change cat @ assets/logo.png` (default stdout) | Exit 0, stdout contains raw PNG bytes (verify `\x89PNG` magic bytes) |
| `CLI-FPI-002` | `codeplane change cat @ assets/logo.png --json` | Exit 0, JSON with `is_image: true`, `mime_type: "image/png"`, `width`, `height`, `content: null` |
| `CLI-FPI-003` | `codeplane change cat @ assets/logo.png --json --encoding base64` | Exit 0, JSON with `content` as valid base64, `encoding: "base64"` |
| `CLI-FPI-004` | `codeplane change cat @ assets/logo.png --info` | Exit 0, stdout contains "Type: PNG", "Dimensions:", "Size:" |
| `CLI-FPI-005` | `codeplane change cat @ assets/logo.png --open` | Exit 0, system viewer invoked (verify subprocess call) |
| `CLI-FPI-006` | `codeplane change cat @ diagram.svg --json` | Exit 0, JSON with `is_image: true`, `is_binary: false`, SVG text in content |
| `CLI-FPI-007` | `codeplane change cat @ nonexistent.png` | Exit 1, stderr contains "not found" |
| `CLI-FPI-008` | `codeplane change cat @ assets/logo.png --info -R owner/repo` (remote) | Exit 0, metadata printed |
| `CLI-FPI-009` | `codeplane change cat @ empty.png --info` | Exit 0, "Dimensions: unknown", "Size: 0 B" |
| `CLI-FPI-010` | `codeplane change cat @ src/main.ts --info` (non-image) | Exit 0, no image-specific type info |
| `CLI-FPI-011` | `codeplane change cat @ huge.jpg --open` (>25 MB) | Exit 0, raw bytes streamed and opened |
| `CLI-FPI-012` | `codeplane change show-file @ assets/logo.png --info` (alias) | Same as CLI-FPI-004 |

### E2E Playwright Tests (Web UI)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `E2E-FPI-001` | Navigate to Code Explorer, click a `.png` file | Image preview renders with `<img>` element; header shows path, "PNG" badge, dimensions, size |
| `E2E-FPI-002` | Click a `.svg` file | SVG renders inline as vector graphic; header shows "SVG" badge |
| `E2E-FPI-003` | Click a `.gif` file | GIF plays animation; header shows "GIF" badge |
| `E2E-FPI-004` | Click a `.jpg` file | JPEG renders; header shows "JPEG" badge, dimensions, size |
| `E2E-FPI-005` | Click "Raw" button on image preview | New tab opens with raw image |
| `E2E-FPI-006` | Click "Download" button | File download triggered with correct filename |
| `E2E-FPI-007` | Click "Copy URL" button | Clipboard contains raw image URL |
| `E2E-FPI-008` | Transparency background for PNG with alpha | Checkerboard pattern visible behind transparent regions |
| `E2E-FPI-009` | Click "1:1" zoom button on large image | Image at actual pixel size; scrollable |
| `E2E-FPI-010` | Click "Fit" after 1:1 | Image scales back to fit panel |
| `E2E-FPI-011` | Click "+" zoom twice | Zoom percentage increases |
| `E2E-FPI-012` | Click "−" zoom | Zoom percentage decreases |
| `E2E-FPI-013` | Mouse wheel on image | Zoom changes centered on cursor |
| `E2E-FPI-014` | Click-drag to pan on zoomed image | Image pans; cursor changes |
| `E2E-FPI-015` | Select oversized image (>25 MB fixture) | Metadata card with "Download" button, no inline render |
| `E2E-FPI-016` | Select corrupted .png (text content) | "Unable to render image" fallback with download link |
| `E2E-FPI-017` | Deep link to image URL | Image renders from direct URL |
| `E2E-FPI-018` | Switch bookmark with image selected | Image reloads for new change |
| `E2E-FPI-019` | SVG with `<script>` — verify no execution | No alert/console output; SVG renders without script |
| `E2E-FPI-020` | Loading spinner before image loads | Spinner visible before image element |
| `E2E-FPI-021` | API error shows retry | Error message and "Retry" button visible |
| `E2E-FPI-022` | Switch from text file to image file | Preview switches correctly |
| `E2E-FPI-023` | Switch from image file to text file | Preview switches correctly |
| `E2E-FPI-024` | Image diff in landing request — side-by-side | Both images visible; size delta shown |
| `E2E-FPI-025` | Image diff swipe slider | Slider overlays old/new images |
| `E2E-FPI-026` | Private repo unauthenticated | Redirect to login |
| `E2E-FPI-027` | Zero-byte .png file | Metadata card, "0 B", no crash |
| `E2E-FPI-028` | WebP image renders | `<img>` shows WebP; "WEBP" badge |

### TUI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `TUI-FPI-001` | Select a `.png` file in Code Explorer | Header shows path, "PNG" badge, dimensions, size; content area shows image or fallback card |
| `TUI-FPI-002` | Select a `.svg` file | Header shows "SVG" badge; fallback card shown |
| `TUI-FPI-003` | Press `o` on image file | System viewer opens (verify subprocess call) |
| `TUI-FPI-004` | Press `y` on image file | "Path copied!" confirmation |
| `TUI-FPI-005` | Press `Y` on image file | "URL copied!" confirmation |
| `TUI-FPI-006` | Press `i` on image file | Info overlay with dimensions, format, size |
| `TUI-FPI-007` | Select zero-byte `.png` | Metadata card, "0 B", "unknown" dimensions |
| `TUI-FPI-008` | Select oversized image (>25 MB) | "Image too large for inline preview" message |
| `TUI-FPI-009` | Press `t` on SVG file | Toggle to syntax-highlighted SVG source |
| `TUI-FPI-010` | Press `t` again on SVG | Toggle back to metadata card |
| `TUI-FPI-011` | `?` shows help with image keys | Help includes `o`, `i`, `t` keys |
| `TUI-FPI-012` | `q` pops screen | Code explorer closes |
| `TUI-FPI-013` | Fallback card at 80×24 terminal | Card fits within viewport |
| `TUI-FPI-014` | Select image then text file | Preview switches from image to text |
| `TUI-FPI-015` | Select text file then image | Preview switches from text to image |
