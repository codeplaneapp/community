# USER_AVATAR_UPLOAD

Specification for USER_AVATAR_UPLOAD.

## High-Level User POV

When a Codeplane user visits their profile settings, they should be able to upload a custom avatar image that represents them across the entire platform. Today, users can only set an avatar by providing an external URL. With avatar upload, users gain the ability to drag-and-drop or browse for an image file directly from their device, crop it to a square frame, and save it as their profile picture — no external hosting required.

Once uploaded, the avatar appears everywhere the user's identity is displayed: repository pages, issue comments, landing request reviews, commit attributions, organization member lists, the TUI dashboard, editor status bars, and any other surface that renders a user's presence. If the user later decides to remove their custom avatar, they can delete it and Codeplane will fall back to a generated identicon based on their username.

The upload experience is designed to be fast and forgiving. Users see a real-time preview before committing to their choice. If they upload an image that's too large or in an unsupported format, they receive a clear, immediate explanation of what went wrong and what to do instead. The entire flow — from selecting a file to seeing the new avatar live on their profile — should feel instantaneous.

From the CLI and TUI, users can also update their avatar by pointing to a local image file. The tool handles the upload transparently, confirming success or reporting any validation failures in a human-readable way. This ensures that users who prefer terminal-based workflows are not forced into the browser to manage their identity.

## Acceptance Criteria

### Definition of Done

The feature is complete when a user can upload, preview, crop, save, replace, and delete a custom avatar image from the web UI, CLI, and TUI, and the avatar is consistently displayed across all Codeplane product surfaces.

### Functional Constraints

- [ ] Users can upload an avatar image from the web UI settings page via file picker or drag-and-drop.
- [ ] Users can upload an avatar image from the CLI via a local file path argument.
- [ ] Users can upload an avatar image from the TUI via a file path input.
- [ ] The uploaded image replaces any previously set avatar (whether URL-based or file-based).
- [ ] Users can delete their uploaded avatar, reverting to the default identicon.
- [ ] The avatar is displayed consistently on all surfaces: web profile, repository pages, issue comments, landing request reviews, organization member lists, TUI screens, and editor integrations.
- [ ] The existing `avatar_url` external-URL flow continues to work; upload is an additional option, not a replacement of the URL-based path.
- [ ] After a successful upload, the user's `avatar_url` field reflects a Codeplane-hosted URL pointing to the uploaded blob.

### Image Constraints

- [ ] Accepted formats: JPEG (.jpg/.jpeg), PNG (.png), GIF (.gif, static only — animated GIFs are accepted but only the first frame is used for display), WebP (.webp).
- [ ] Maximum file size: 2 MB (2,097,152 bytes).
- [ ] Minimum image dimensions: 20×20 pixels.
- [ ] Maximum image dimensions: 4096×4096 pixels.
- [ ] Images are served in their original format; no server-side transcoding is required for v1.
- [ ] The server stores and serves the image at the uploaded resolution. The web UI is responsible for rendering at appropriate display sizes via CSS.

### Crop and Preview Constraints

- [ ] The web UI provides a square crop tool that defaults to a center crop of the largest inscribed square.
- [ ] The crop tool allows the user to pan and zoom before confirming.
- [ ] A circular preview mask is shown alongside the crop tool to approximate how the avatar will render in most contexts.
- [ ] The cropped output is what gets uploaded — the server receives only the final cropped image.

### Validation and Error Constraints

- [ ] Uploading a file that exceeds 2 MB returns a clear error: "Image must be under 2 MB."
- [ ] Uploading a file with an unsupported MIME type returns: "Unsupported image format. Please use JPEG, PNG, GIF, or WebP."
- [ ] Uploading a file with dimensions below the minimum returns: "Image must be at least 20×20 pixels."
- [ ] Uploading a file with dimensions above the maximum returns: "Image must be no larger than 4096×4096 pixels."
- [ ] Uploading an empty (0-byte) file returns: "The uploaded file is empty."
- [ ] Uploading a file whose extension does not match its actual MIME type returns: "Unsupported image format. Please use JPEG, PNG, GIF, or WebP."
- [ ] All validation errors are returned as structured JSON with a consistent error shape.
- [ ] The web UI shows validation errors inline next to the upload area without navigating away.

### Idempotency and Replace Constraints

- [ ] Uploading a new avatar when one already exists overwrites the previous blob and updates the URL atomically.
- [ ] The previous blob is deleted from storage after a successful replacement (no orphaned blobs).
- [ ] If the upload confirmation step fails, the previous avatar remains unchanged.

### Fallback Constraints

- [ ] When `avatar_url` is empty or null, all surfaces render a deterministic identicon derived from the username.
- [ ] When `avatar_url` points to an uploaded blob that cannot be fetched, surfaces degrade to the identicon rather than showing a broken image.

## Design

### Web UI Design

#### Settings Page — Profile Section

The avatar upload control appears in the **Profile** section of the user settings page (`/settings`), directly above the display name and bio fields.

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│  Profile Settings                                   │
│                                                     │
│  ┌──────────┐                                       │
│  │          │  ← Current avatar (128×128 circle)    │
│  │  Avatar  │                                       │
│  │          │                                       │
│  └──────────┘                                       │
│  [Upload new avatar]  [Remove avatar]               │
│                                                     │
│  Display Name: [____________________]               │
│  Bio:          [____________________]               │
│                                                     │
│  [Save profile]                                     │
└─────────────────────────────────────────────────────┘
```

**Interactions:**

- Clicking **"Upload new avatar"** opens the OS file picker filtered to image types.
- Alternatively, the user can drag-and-drop an image onto the avatar area. The drop zone highlights with a dashed border and "Drop image here" overlay.
- After selecting a file, a **crop modal** appears with a square crop frame, pan/zoom support (mouse drag, scroll wheel, pinch on touch), and a circular preview inset.
- **"Save"** and **"Cancel"** buttons in the crop modal.
- On save, a spinner replaces the avatar circle during upload. On success, the new avatar renders immediately.
- **"Remove avatar"** is only visible when a custom avatar is set. Clicking it shows a confirmation dialog.
- Validation errors appear as a red toast notification anchored below the avatar area.

#### Avatar Display Sizes Across Surfaces

- Profile page header: 120×120px circle
- Issue/landing request comments: 32×32px circle
- Repository contributor list: 28×28px circle
- Organization member list: 40×40px circle
- Navigation sidebar (current user): 24×24px circle
- Command palette results: 20×20px circle

All rendered with `object-fit: cover`, circular clip mask, and subtle 1px border.

### API Shape

#### Upload Avatar

```
POST /api/user/avatar/upload
Content-Type: multipart/form-data
Form fields: file (binary, required)
```

Success (200): `{ "avatar_url": "https://codeplane.example.com/api/avatars/u/<user_id>/<hash>.png" }`
Errors: 400 (validation), 401 (unauth), 413 (too large), 429 (rate limited).

#### Delete Avatar

```
DELETE /api/user/avatar
```

Success (200): `{ "avatar_url": "" }`. Idempotent — succeeds even if no avatar exists.

#### Serve Avatar

```
GET /api/avatars/u/<user_id>/<hash>.<ext>
```

Success (200): image bytes, correct Content-Type, `Cache-Control: public, max-age=31536000, immutable`.
Error: 404 if blob not found.

#### Backward Compatibility

Existing `POST /api/user/avatar` (JSON `{ avatar_url }`) and `PATCH /api/user` (with `avatar_url` field) continue to work. Setting an external URL via PATCH clears any uploaded blob.

### SDK Shape

Extend `UserService` with:
- `uploadAvatar(userId, file, contentType, fileName)` → `Result<{ avatarUrl }, AvatarUploadError>`
- `deleteAvatar(userId)` → `Result<void, AvatarDeleteError>`
- `getAvatarBlobKey(userId, hash, ext)` → deterministic blob key

Blob key format: `avatars/u/<user_id>/<content_hash>.<ext>`

### CLI Command

```
codeplane user avatar upload <file-path>    # Upload local image
codeplane user avatar remove                # Remove avatar
codeplane user avatar show                  # Show current avatar URL
```

All commands support `--json` for structured output. Errors print to stderr with exit code 1.

### TUI UI

In the settings/profile screen:
```
Avatar: [current avatar URL or "(default)"]
  [u] Upload new avatar
  [r] Remove avatar
```
`u` prompts for file path input. `r` removes with confirmation.

### Editor Integrations

VS Code and Neovim do not expose direct upload commands. Avatar displays update reactively via daemon sync or API refresh.

### Documentation

- **User Guide: "Managing Your Avatar"**: Web upload walkthrough (with screenshots), CLI usage, remove flow, supported formats/limits, identicon fallback explanation.
- **API Reference: Avatar Endpoints**: OpenAPI docs for upload, delete, and serve endpoints.
- **CLI Reference update**: Add `user avatar` subcommands.

## Permissions & Security

### Authorization

| Action | Required Role |
|---|---|
| Upload own avatar | Authenticated user (any role) |
| Delete own avatar | Authenticated user (any role) |
| View any user's avatar | Anonymous (public) |
| Upload avatar for another user | Admin only (via admin API) |

No organization-level or team-level permission is required. Avatar management is strictly per-user self-service. Admin users can clear any user's avatar via the admin panel.

### Rate Limiting

- `POST /api/user/avatar/upload`: **10 requests per hour** per authenticated user.
- `DELETE /api/user/avatar`: **20 requests per hour** per authenticated user.
- `GET /api/avatars/u/:id/:hash.:ext`: No per-user limit (public, cacheable). Standard global rate limiting applies.
- Failed validation attempts count toward the upload rate limit to prevent probing.

### Data Privacy

- Avatar images are **public by default**. Any user (including anonymous) can view any user's avatar.
- Avatar blob keys include user ID (already public) and content hash (no sensitive info).
- The serving endpoint does not set cookies or track viewers.
- EXIF metadata is **stripped** from uploaded images before storage to prevent PII leakage (GPS coordinates, device info, timestamps).
- Content-Security-Policy on the serving endpoint prevents XSS vectors; Content-Type strictly set to image MIME.

### Input Sanitization

- Uploaded files are validated by reading magic bytes (file signature), not just declared Content-Type or extension.
- SVG files are explicitly **not** accepted due to XSS risk.
- Files are never executed, interpreted, or included as HTML.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `AvatarUploaded` | User successfully uploads a new avatar | `user_id`, `file_size_bytes`, `content_type`, `image_width`, `image_height`, `client` (web/cli/tui), `replaced_existing` (bool), `upload_duration_ms` |
| `AvatarRemoved` | User removes their avatar | `user_id`, `client` (web/cli/tui), `had_uploaded_avatar` (bool) |
| `AvatarUploadFailed` | Upload rejected due to validation | `user_id`, `failure_reason`, `file_size_bytes`, `declared_content_type`, `client` |
| `AvatarCropCompleted` | User completes the crop modal (web only) | `user_id`, `original_width`, `original_height`, `crop_width`, `crop_height`, `time_in_crop_modal_ms` |
| `AvatarCropAbandoned` | User opens crop modal but cancels | `user_id`, `time_in_crop_modal_ms` |

### Funnel Metrics

1. **Upload Funnel**: Settings page visit → Click "Upload" → File selected → Crop completed → Upload success. Target: ≥80% completion from crop modal open to upload success.
2. **Adoption Rate**: Percentage of active users with a custom avatar vs. default identicon. Track trend over time.
3. **Failure Rate**: `AvatarUploadFailed / (AvatarUploaded + AvatarUploadFailed)`. Target: <5%.
4. **Replace Rate**: Percentage of `AvatarUploaded` events where `replaced_existing` is true.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Avatar upload started | `info` | `user_id`, `file_size_bytes`, `content_type`, `client` |
| Avatar upload succeeded | `info` | `user_id`, `blob_key`, `upload_duration_ms`, `content_type` |
| Avatar upload validation failed | `warn` | `user_id`, `failure_reason`, `file_size_bytes`, `declared_content_type` |
| Avatar blob write failed | `error` | `user_id`, `blob_key`, `error_message`, `error_stack` |
| Avatar deleted | `info` | `user_id`, `blob_key` |
| Avatar blob delete failed | `error` | `user_id`, `blob_key`, `error_message` |
| Orphaned blob cleanup triggered | `info` | `blob_key`, `reason` |
| Orphaned blob cleanup failed | `error` | `blob_key`, `error_message` |
| EXIF strip completed | `debug` | `user_id`, `original_size_bytes`, `stripped_size_bytes` |
| Avatar serving cache miss | `debug` | `blob_key`, `fetch_duration_ms` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_avatar_uploads_total` | Counter | `status` (success/failure), `client` | Total upload attempts |
| `codeplane_avatar_upload_duration_seconds` | Histogram | `client` | Upload latency (buckets: 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_avatar_upload_size_bytes` | Histogram | — | Upload file sizes (buckets: 10KB, 50KB, 100KB, 250KB, 500KB, 1MB, 2MB) |
| `codeplane_avatar_validation_failures_total` | Counter | `reason` | Validation failures by reason |
| `codeplane_avatar_deletes_total` | Counter | `status` | Delete attempts |
| `codeplane_avatar_serve_requests_total` | Counter | `status` (200/404) | Serve requests |
| `codeplane_avatar_serve_duration_seconds` | Histogram | — | Serve latency (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25) |
| `codeplane_avatar_blob_store_errors_total` | Counter | `operation` (put/get/delete) | Blob store failures |

### Alerts and Runbooks

#### Alert: High Avatar Upload Failure Rate
**Condition**: `rate(codeplane_avatar_validation_failures_total[5m]) / rate(codeplane_avatar_uploads_total[5m]) > 0.3` for 10 min. **Severity**: Warning.
**Runbook**: (1) Check failures by `reason` label. (2) If `file_too_large` dominates, review size limit vs. user expectations. (3) If `unsupported_format`, check for new client formats (e.g., HEIC). (4) If `invalid_image`, investigate client-side upload corruption.

#### Alert: Avatar Blob Store Errors
**Condition**: `rate(codeplane_avatar_blob_store_errors_total[5m]) > 0` for 5 min. **Severity**: Critical.
**Runbook**: (1) Check disk space, filesystem permissions, mount status. (2) Check `operation` label to scope impact. (3) For LocalBlobStore, verify `$CODEPLANE_DATA_DIR/blobs/` is writable and inodes available. (4) Check server error logs for stack traces. (5) If disk full, escalate to infra.

#### Alert: Slow Avatar Uploads
**Condition**: `histogram_quantile(0.95, codeplane_avatar_upload_duration_seconds) > 5` for 10 min. **Severity**: Warning.
**Runbook**: (1) Check server CPU/memory (EXIF stripping is CPU-bound). (2) Check blob store write latency. (3) Check upload size distribution. (4) Look for automated upload storms. (5) Restart isolated instances; investigate systemic blob store issues.

#### Alert: Avatar Serve Latency Spike
**Condition**: `histogram_quantile(0.99, codeplane_avatar_serve_duration_seconds) > 0.5` for 5 min. **Severity**: Warning.
**Runbook**: (1) Verify CDN/proxy cache is functioning. (2) Check cache miss rate. (3) Check blob store read latency. (4) For LocalBlobStore, check disk I/O. (5) Consider in-memory LRU cache.

### Error Cases and Failure Modes

| Failure | Impact | Mitigation |
|---|---|---|
| Blob write fails mid-upload | User sees error, no avatar change | avatar_url only updated after blob write succeeds |
| Blob read fails on serve | Broken image | Clients fall back to identicon |
| EXIF strip fails | Potential PII exposure | Reject upload with "invalid_image" |
| DB update fails after blob write | Orphaned blob | Cleanup scheduler deletes unreferenced blobs |
| Concurrent uploads | Race condition | Last-write-wins; orphan cleanup handles loser's blob |
| Disk full | All uploads fail | Alert fires; uploads fail atomically, no data loss |
| User deletes account | Orphaned blob | Account deletion flow must delete avatar blob |

## Verification

### API Integration Tests

- [ ] Upload valid JPEG (500×500, under 2 MB) → 200 with `avatar_url`
- [ ] Upload valid PNG (256×256) → 200 with `avatar_url`
- [ ] Upload valid WebP (100×100) → 200
- [ ] Upload valid GIF (64×64) → 200
- [ ] Upload at exactly maximum size (2,097,152 bytes) → 200
- [ ] Upload exceeding maximum size (2,097,153 bytes) → 400 "Image must be under 2 MB."
- [ ] Upload empty file (0 bytes) → 400 "The uploaded file is empty."
- [ ] Upload unsupported format BMP → 400 "Unsupported image format."
- [ ] Upload unsupported format SVG → 400 "Unsupported image format."
- [ ] Upload disguised file (text renamed to .png) → 400 "Unsupported image format."
- [ ] Upload below minimum dimensions (10×10) → 400 "Image must be at least 20×20 pixels."
- [ ] Upload at minimum dimensions (20×20) → 200
- [ ] Upload at maximum dimensions (4096×4096) → 200
- [ ] Upload above maximum dimensions (4097×4097) → 400 "Image must be no larger than 4096×4096 pixels."
- [ ] Upload wide image within max (4096×1) → 200
- [ ] Upload replaces existing: upload A then B → avatar_url changes, blob A eventually deleted
- [ ] Upload without authentication → 401
- [ ] Upload with invalid token → 401
- [ ] Serve uploaded avatar → 200 with correct Content-Type and image bytes
- [ ] Serve avatar has cache headers → `Cache-Control: public, max-age=31536000, immutable`
- [ ] Serve non-existent avatar → 404
- [ ] Delete avatar after upload → 200 with empty avatar_url; old URL returns 404
- [ ] Delete when no avatar set → 200 with empty avatar_url (idempotent)
- [ ] Delete then verify profile → GET /api/user shows empty avatar_url
- [ ] Rate limit: 11 uploads in 1 hour → 11th returns 429
- [ ] EXIF stripping: upload JPEG with GPS EXIF → download and verify EXIF absent
- [ ] Concurrent uploads: two simultaneous uploads → both 200, no orphaned blobs after cleanup
- [ ] PATCH /api/user with external URL clears uploaded blob
- [ ] Existing POST /api/user/avatar with JSON `{ avatar_url }` still works
- [ ] Content-Type matches uploaded format (PNG→image/png, JPEG→image/jpeg)

### CLI Integration Tests

- [ ] `codeplane user avatar upload ./test-avatar.png` → exit 0, prints URL
- [ ] `codeplane user avatar upload ./missing.png` → exit 1, "File not found"
- [ ] `codeplane user avatar upload ./huge.png` (>2 MB) → exit 1, size error
- [ ] `codeplane user avatar upload ./image.bmp` → exit 1, format error
- [ ] `codeplane user avatar upload ./test.png --json` → exit 0, JSON output
- [ ] `codeplane user avatar remove` → exit 0, confirmation message
- [ ] `codeplane user avatar remove --json` → exit 0, JSON output
- [ ] `codeplane user avatar show` → exit 0, prints URL or "(default identicon)"
- [ ] `codeplane user avatar show --json` → exit 0, JSON output
- [ ] `codeplane user avatar upload ./test.png` without auth → exit 1, auth error

### Web UI E2E Tests (Playwright)

- [ ] Upload via file picker: settings → click upload → select image → crop modal → save → avatar updates
- [ ] Upload via drag-and-drop: drag image onto avatar area → crop modal → save → avatar updates
- [ ] Crop modal cancel: open crop → cancel → no upload, avatar unchanged
- [ ] Crop modal pan and zoom: open crop → zoom/pan → save → upload succeeds
- [ ] Remove avatar: upload → click remove → confirm → identicon shown
- [ ] Remove avatar cancel: click remove → cancel → avatar unchanged
- [ ] Validation error display: select oversized file → error toast with correct message
- [ ] Avatar visible on profile page (/:username) at expected size
- [ ] Avatar visible on issue comment next to author name
- [ ] Avatar visible in sidebar next to username
- [ ] Identicon fallback: remove avatar → all surfaces show identicon, no broken images
- [ ] Replace avatar: upload A → upload B → all surfaces show B
- [ ] "Remove avatar" button hidden when no custom avatar set

### TUI Integration Tests

- [ ] Navigate to settings → press `u` → enter valid path → avatar URL updates
- [ ] Press `u` → enter non-existent path → error message displayed
- [ ] Press `r` → confirm → avatar URL clears
- [ ] Press `r` → decline → avatar unchanged
