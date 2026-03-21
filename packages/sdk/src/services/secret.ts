import { createHash } from "crypto";
import type { Sql } from "postgres";
import { Result } from "better-result";

import {
  type APIError,
  badRequest,
  internal,
  notFound,
} from "../lib/errors";

import {
  createOrUpdateSecret,
  listSecrets,
  listSecretValuesForRepo,
  getSecretValueByName,
  deleteSecret,
} from "../db/secrets_sql";

import {
  createOrUpdateVariable,
  getVariableByName,
  listVariables,
  deleteVariable,
} from "../db/variables_sql";

// ---------------------------------------------------------------------------
// AES-GCM encryption — matches Go's pkg/crypto + webhook.AESGCMSecretCodec
// ---------------------------------------------------------------------------

/**
 * Derive a 32-byte AES-256 key from a secret string using SHA-256.
 * Matches Go's crypto.DeriveKey.
 */
function deriveKey(secret: string): ArrayBuffer {
  const hash = createHash("sha256").update(secret).digest();
  return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
}

/**
 * Encrypt plaintext using AES-256-GCM with a random 12-byte nonce.
 * Output format: nonce (12 bytes) || ciphertext || GCM tag (16 bytes)
 * Then base64-encoded for storage.
 * Matches Go's crypto.Encrypt + base64 encoding.
 */
async function encryptSecret(
  key: ArrayBuffer,
  plaintext: string
): Promise<Buffer> {
  if (plaintext === "") return Buffer.alloc(0);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    encoded
  );

  // Combine nonce + ciphertext (which includes the GCM tag)
  const result = new Uint8Array(nonce.length + ciphertext.byteLength);
  result.set(nonce, 0);
  result.set(new Uint8Array(ciphertext), nonce.length);

  return Buffer.from(result);
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 * Input format: nonce (12 bytes) || ciphertext || GCM tag (16 bytes)
 * Matches Go's crypto.Decrypt.
 */
async function decryptSecret(
  key: ArrayBuffer,
  ciphertextBuf: Buffer
): Promise<string> {
  if (ciphertextBuf.length === 0) return "";

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const nonceSize = 12;
  if (ciphertextBuf.length < nonceSize) {
    throw new Error("ciphertext too short");
  }

  const nonce = new Uint8Array(ciphertextBuf.subarray(0, nonceSize));
  const ciphertext = new Uint8Array(ciphertextBuf.subarray(nonceSize));

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecretSummary {
  id: number;
  repository_id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SecretDetail {
  id: number;
  repository_id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface VariableResponse {
  id: number;
  repository_id: number;
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// SecretService — matches Go's secret management + SecretInjector
// ---------------------------------------------------------------------------

export class SecretService {
  private encryptionKey: ArrayBuffer | null;

  constructor(
    private readonly sql: Sql,
    secretKey?: string
  ) {
    const key = secretKey ?? process.env.JJHUB_SECRET_KEY ?? "";
    this.encryptionKey = key.trim() !== "" ? deriveKey(key.trim()) : null;
  }

  // ---- Secrets ----

  /**
   * List all secrets for a repository (names only, no values).
   * Matches Go's ListSecrets route.
   */
  async listSecrets(
    repositoryId: string
  ): Promise<Result<SecretSummary[], APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }

    const rows = await listSecrets(this.sql, { repositoryId });

    return Result.ok(
      rows.map((r) => ({
        id: Number(r.id),
        repository_id: Number(r.repositoryId),
        name: r.name,
        created_at: toISO(r.createdAt),
        updated_at: toISO(r.updatedAt),
      }))
    );
  }

  /**
   * Create or update a secret with AES-GCM encryption.
   * Matches Go's CreateOrUpdateSecret + AESGCMSecretCodec.EncryptString.
   */
  async setSecret(
    repositoryId: string,
    name: string,
    value: string
  ): Promise<Result<SecretDetail, APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }
    if (!name.trim()) {
      return Result.err(badRequest("secret name is required"));
    }
    if (!value) {
      return Result.err(badRequest("secret value is required"));
    }

    let encryptedValue: Buffer;
    if (this.encryptionKey) {
      try {
        encryptedValue = await encryptSecret(this.encryptionKey, value);
      } catch {
        return Result.err(internal("failed to encrypt secret value"));
      }
    } else {
      // Fallback: store as plain bytes (development mode, no key configured)
      encryptedValue = Buffer.from(value, "utf-8");
    }

    const row = await createOrUpdateSecret(this.sql, {
      repositoryId,
      name: name.trim(),
      valueEncrypted: encryptedValue,
    });
    if (!row) {
      return Result.err(internal("failed to store secret"));
    }

    return Result.ok({
      id: Number(row.id),
      repository_id: Number(row.repositoryId),
      name: row.name,
      created_at: toISO(row.createdAt),
      updated_at: toISO(row.updatedAt),
    });
  }

  /**
   * Delete a secret.
   * Matches Go's DeleteSecret route.
   */
  async deleteSecret(
    repositoryId: string,
    name: string
  ): Promise<Result<void, APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }
    if (!name.trim()) {
      return Result.err(badRequest("secret name is required"));
    }

    await deleteSecret(this.sql, { repositoryId, name: name.trim() });
    return Result.ok(undefined);
  }

  /**
   * Get decrypted secret value by name.
   * Matches Go's SecretInjector.RepositoryEnvironment single-key variant.
   */
  async getDecryptedValue(
    repositoryId: string,
    name: string
  ): Promise<Result<string, APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }

    const row = await getSecretValueByName(this.sql, {
      repositoryId,
      name: name.trim(),
    });
    if (!row) return Result.err(notFound("secret not found"));

    if (!this.encryptionKey) {
      // No encryption key — assume plaintext storage
      return Result.ok(row.valueEncrypted.toString("utf-8"));
    }

    try {
      const decrypted = await decryptSecret(
        this.encryptionKey,
        row.valueEncrypted
      );
      return Result.ok(decrypted);
    } catch {
      return Result.err(internal("failed to decrypt secret value"));
    }
  }

  /**
   * Get all decrypted secrets for a repository as an environment map.
   * Matches Go's SecretInjector.RepositoryEnvironment.
   */
  async getRepositoryEnvironment(
    repositoryId: string
  ): Promise<Result<Record<string, string>, APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }

    const rows = await listSecretValuesForRepo(this.sql, { repositoryId });
    const env: Record<string, string> = {};

    for (const row of rows) {
      const name = row.name.trim();
      if (!isValidSecretEnvName(name)) {
        return Result.err(
          internal(
            `repository secret "${row.name}" is not a valid environment variable name`
          )
        );
      }

      let value: string;
      if (this.encryptionKey) {
        try {
          value = await decryptSecret(this.encryptionKey, row.valueEncrypted);
        } catch {
          return Result.err(
            internal(`failed to decrypt repository secret "${name}"`)
          );
        }
      } else {
        value = row.valueEncrypted.toString("utf-8");
      }

      if (value === "") continue;
      env[name] = value;
    }

    return Result.ok(env);
  }

  // ---- Variables ----

  /**
   * List all variables for a repository.
   * Matches Go's ListVariables route.
   */
  async listVariables(
    repositoryId: string
  ): Promise<Result<VariableResponse[], APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }

    const rows = await listVariables(this.sql, { repositoryId });

    return Result.ok(
      rows.map((r) => ({
        id: Number(r.id),
        repository_id: Number(r.repositoryId),
        name: r.name,
        value: r.value,
        created_at: toISO(r.createdAt),
        updated_at: toISO(r.updatedAt),
      }))
    );
  }

  /**
   * Create or update a variable (plaintext, not encrypted).
   * Matches Go's CreateOrUpdateVariable.
   */
  async setVariable(
    repositoryId: string,
    name: string,
    value: string
  ): Promise<Result<VariableResponse, APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }
    if (!name.trim()) {
      return Result.err(badRequest("variable name is required"));
    }
    if (!value) {
      return Result.err(badRequest("variable value is required"));
    }

    const row = await createOrUpdateVariable(this.sql, {
      repositoryId,
      name: name.trim(),
      value,
    });
    if (!row) {
      return Result.err(internal("failed to store variable"));
    }

    return Result.ok({
      id: Number(row.id),
      repository_id: Number(row.repositoryId),
      name: row.name,
      value: row.value,
      created_at: toISO(row.createdAt),
      updated_at: toISO(row.updatedAt),
    });
  }

  /**
   * Get a single variable by name.
   * Matches Go's GetVariableByName.
   */
  async getVariable(
    repositoryId: string,
    name: string
  ): Promise<Result<VariableResponse, APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }

    const row = await getVariableByName(this.sql, {
      repositoryId,
      name: name.trim(),
    });
    if (!row) return Result.err(notFound("variable not found"));

    return Result.ok({
      id: Number(row.id),
      repository_id: Number(row.repositoryId),
      name: row.name,
      value: row.value,
      created_at: toISO(row.createdAt),
      updated_at: toISO(row.updatedAt),
    });
  }

  /**
   * Delete a variable.
   * Matches Go's DeleteVariable route.
   */
  async deleteVariable(
    repositoryId: string,
    name: string
  ): Promise<Result<void, APIError>> {
    if (!repositoryId || Number(repositoryId) <= 0) {
      return Result.err(badRequest("invalid repository id"));
    }
    if (!name.trim()) {
      return Result.err(badRequest("variable name is required"));
    }

    await deleteVariable(this.sql, { repositoryId, name: name.trim() });
    return Result.ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Matches Go's injectedSecretNamePattern: ^[A-Za-z_][A-Za-z0-9_]*$ */
const VALID_ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isValidSecretEnvName(name: string): boolean {
  return VALID_ENV_NAME_PATTERN.test(name.trim());
}

function toISO(d: Date | string): string {
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

/**
 * Redact secret values from text output.
 * Matches Go's RedactSecretValues — replaces longer values first.
 */
export function redactSecretValues(
  secretEnv: Record<string, string>,
  text: string
): string {
  if (Object.keys(secretEnv).length === 0 || text === "") return text;

  const seen = new Set<string>();
  const values: string[] = [];
  for (const value of Object.values(secretEnv)) {
    const trimmed = value.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    values.push(trimmed);
  }

  // Sort longest first so longer matches take precedence
  values.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    return a.localeCompare(b);
  });

  let redacted = text;
  for (const value of values) {
    redacted = redacted.replaceAll(value, "********");
  }
  return redacted;
}
