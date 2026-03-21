/**
 * Local filesystem blob storage adapter for Codeplane Community Edition.
 *
 * Replaces GCS in the OSS version. Stores blobs under CODEPLANE_DATA_DIR/blobs/
 * (default: ./data/blobs/). Implements the same interface as Go's blob.Store:
 *   put, get, delete, exists, signedUploadURL, signedDownloadURL, stat
 *
 * "Signed URLs" in local mode are just file:// paths with an HMAC token
 * to keep the interface consistent. The server itself handles the actual
 * upload/download via these local paths.
 */

import { createHmac, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink, stat, access } from "node:fs/promises";
import { join, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default signed URL expiry in milliseconds (5 minutes). */
export const DEFAULT_SIGNED_URL_EXPIRY_MS = 5 * 60 * 1000;

/** Sentinel value when object size is unknown. */
export const UNKNOWN_OBJECT_SIZE = -1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ObjectAttrs {
  size: number;
}

export class BlobNotFoundError extends Error {
  constructor(key: string) {
    super(`blob object not found: ${key}`);
    this.name = "BlobNotFoundError";
  }
}

export interface BlobStore {
  /** Write data to the given key. */
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  /** Read data from the given key. */
  get(key: string): Promise<Buffer>;
  /** Delete the blob at the given key. Silently succeeds if not found. */
  delete(key: string): Promise<void>;
  /** Check whether a blob exists at the given key. */
  exists(key: string): Promise<boolean>;
  /** Get object attributes (size). Throws BlobNotFoundError if missing. */
  stat(key: string): Promise<ObjectAttrs>;
  /** Generate a URL/path for uploading a blob. */
  generateUploadURL(key: string, contentType: string, expiryMs: number): string;
  /** Generate a URL/path for downloading a blob. */
  generateDownloadURL(key: string, expiryMs: number): string;
}

// ---------------------------------------------------------------------------
// Local Filesystem Implementation
// ---------------------------------------------------------------------------

export class LocalBlobStore implements BlobStore {
  private readonly baseDir: string;
  private readonly signingSecret: string;

  constructor(baseDir?: string, signingSecret?: string) {
    this.baseDir =
      baseDir ??
      join(process.env.CODEPLANE_DATA_DIR ?? "./data", "blobs");
    this.signingSecret =
      signingSecret ??
      process.env.CODEPLANE_BLOB_SIGNING_SECRET ??
      "codeplane-local-dev-secret";
  }

  private resolvePath(key: string): string {
    // Prevent path traversal
    const normalized = key.replace(/\.\./g, "_");
    return join(this.baseDir, normalized);
  }

  async put(key: string, data: Buffer, _contentType?: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async get(key: string): Promise<Buffer> {
    const filePath = this.resolvePath(key);
    try {
      return await readFile(filePath);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw new BlobNotFoundError(key);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    try {
      await unlink(filePath);
    } catch (err: any) {
      // Silently ignore if file doesn't exist
      if (err?.code !== "ENOENT") {
        throw err;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async stat(key: string): Promise<ObjectAttrs> {
    const filePath = this.resolvePath(key);
    try {
      const stats = await stat(filePath);
      return { size: stats.size };
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw new BlobNotFoundError(key);
      }
      throw err;
    }
  }

  generateUploadURL(key: string, _contentType: string, expiryMs: number): string {
    const expiresAt = Date.now() + expiryMs;
    const token = this.signToken(key, expiresAt);
    return `/api/blobs/upload/${encodeURIComponent(key)}?token=${token}&expires=${expiresAt}`;
  }

  generateDownloadURL(key: string, expiryMs: number): string {
    const expiresAt = Date.now() + expiryMs;
    const token = this.signToken(key, expiresAt);
    return `/api/blobs/download/${encodeURIComponent(key)}?token=${token}&expires=${expiresAt}`;
  }

  private signToken(key: string, expiresAt: number): string {
    const payload = `${key}:${expiresAt}`;
    return createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("hex");
  }

  /**
   * Verify a signed token for upload/download URLs.
   * Returns true if the token is valid and not expired.
   */
  verifyToken(key: string, token: string, expiresAt: number): boolean {
    if (Date.now() > expiresAt) return false;
    const expected = this.signToken(key, expiresAt);
    return token === expected;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let instance: LocalBlobStore | null = null;

export function getBlobStore(): LocalBlobStore {
  if (!instance) {
    instance = new LocalBlobStore();
  }
  return instance;
}

export function createBlobStore(baseDir?: string, signingSecret?: string): LocalBlobStore {
  return new LocalBlobStore(baseDir, signingSecret);
}
