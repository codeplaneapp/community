/**
 * Database connection module for Codeplane Community Edition.
 *
 * Supports two modes controlled by CODEPLANE_DB_MODE:
 *
 *   "postgres" (default) — connects to external PostgreSQL via postgres.js.
 *     Configured via CODEPLANE_DATABASE_URL or CODEPLANE_DB_HOST/PORT/NAME/USER/PASSWORD.
 *
 *   "pglite" — uses @electric-sql/pglite (PostgreSQL compiled to WASM),
 *     running in-process with no external PostgreSQL needed.
 *     Data stored in CODEPLANE_DATA_DIR/db/ (default: ./data/db/).
 *
 * The sqlc-generated TypeScript code imports `{ Sql } from "postgres"`
 * and calls `sql.unsafe(query, params).values()`. In PGLite mode, an
 * adapter makes PGLite conform to this interface.
 */

import postgres, { type Sql } from "postgres";

let instance: Sql | null = null;
let mode: "postgres" | "pglite" = "postgres";

/**
 * Get the current DB mode.
 */
export function getDbMode(): "postgres" | "pglite" {
  return mode;
}

/**
 * Build postgres.js connection options from environment variables.
 */
function buildConnectionOptions(): postgres.Options<{}> | string {
  const url = process.env.CODEPLANE_DATABASE_URL;
  if (url) {
    return url;
  }

  return {
    host: process.env.CODEPLANE_DB_HOST ?? "localhost",
    port: parseInt(process.env.CODEPLANE_DB_PORT ?? "5432", 10),
    database: process.env.CODEPLANE_DB_NAME ?? "codeplane",
    username: process.env.CODEPLANE_DB_USER ?? "codeplane",
    password: process.env.CODEPLANE_DB_PASSWORD ?? "",
  };
}

/**
 * Resolve the PGLite data directory from environment variables.
 */
function resolvePGLiteDataDir(): string {
  const dataDir = process.env.CODEPLANE_DATA_DIR ?? "./data";
  return `${dataDir}/db`;
}

/**
 * Initialize the database connection. Call once at startup.
 * Subsequent calls return the existing connection.
 *
 * Reads CODEPLANE_DB_MODE to select the backend:
 *   - "postgres" (default): uses postgres.js
 *   - "pglite": uses @electric-sql/pglite with adapter
 */
export async function initDb(): Promise<Sql> {
  if (instance) {
    return instance;
  }

  const envMode = process.env.CODEPLANE_DB_MODE ?? "postgres";

  if (envMode === "pglite") {
    mode = "pglite";
    const { createPGLiteInstance, createPGLiteAdapter } = await import(
      "./pglite-adapter.js"
    );
    const dataDir = resolvePGLiteDataDir();
    const db = await createPGLiteInstance(dataDir);
    // The adapter conforms to the Sql interface that sqlc expects
    instance = createPGLiteAdapter(db) as unknown as Sql;
    return instance;
  }

  mode = "postgres";
  const opts = buildConnectionOptions();
  instance = typeof opts === "string" ? postgres(opts) : postgres(opts as any);
  return instance;
}

/**
 * Synchronous init — only for postgres mode (backwards compatibility).
 * For PGLite mode, use initDb() (async) instead.
 *
 * @deprecated Use initDb() for new code. This exists for backward compat.
 */
export function initDbSync(): Sql {
  if (instance) {
    return instance;
  }

  const envMode = process.env.CODEPLANE_DB_MODE ?? "postgres";
  if (envMode === "pglite") {
    throw new Error(
      "Cannot use initDbSync() with PGLite mode. Use initDb() (async) instead.",
    );
  }

  mode = "postgres";
  const opts = buildConnectionOptions();
  instance = typeof opts === "string" ? postgres(opts) : postgres(opts as any);
  return instance;
}

/**
 * Get the database client. Throws if initDb() has not been called.
 * The returned `Sql` instance is exactly the type that sqlc-generated
 * query functions accept as their first argument.
 */
export function getDb(): Sql {
  if (!instance) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return instance;
}

/**
 * Convenience re-export: a sql tagged template for raw queries.
 * Lazily resolves to the singleton — use only after initDb().
 *
 * Usage:
 *   import { sql } from "./lib/db";
 *   const rows = await sql`SELECT 1`;
 */
export function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
) {
  return (getDb() as any)(strings, ...values);
}

/**
 * Gracefully close the database connection pool.
 * Call during server shutdown.
 */
export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.end();
    instance = null;
  }
}

export type { Sql };
