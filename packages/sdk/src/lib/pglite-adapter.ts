/**
 * PGLite adapter for sqlc-generated queries.
 *
 * sqlc-generated TypeScript code uses the postgres.js interface:
 *   sql.unsafe(query, params).values()  ->  Promise<any[][]>
 *   sql`tagged template`                ->  Promise<Row[]>
 *   sql.end()                           ->  Promise<void>
 *
 * This adapter wraps @electric-sql/pglite to conform to that shape,
 * so the same sqlc-generated code works with both postgres.js and PGLite.
 */

import { PGlite, type PGliteOptions } from "@electric-sql/pglite";

/**
 * Result object returned by `sql.unsafe(query, params)`.
 * Must have a `.values()` method that returns rows as arrays.
 */
interface UnsafeResult {
  values(): Promise<any[][]>;
  then: Promise<any[]>["then"];
  catch: Promise<any[]>["catch"];
  [Symbol.asyncIterator]?: any;
}

/**
 * The shape that sqlc-generated code expects from the `sql` parameter.
 * This is a subset of postgres.js `Sql` — only the parts sqlc uses.
 */
export interface PGLiteAsSql {
  unsafe(query: string, params?: any[]): UnsafeResult;
  end(): Promise<void>;
  // Tagged template support for raw queries (e.g. sql`SELECT 1`)
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]>;
}

/**
 * Convert PGLite $N-style params to positional.
 *
 * postgres.js `unsafe()` uses $1, $2, etc. which PGLite also supports
 * natively, so no rewriting is needed — but we need to translate the
 * result shape from PGLite's `{ rows, fields }` to `values()` returning
 * an array of arrays (rows in positional order).
 */
function createUnsafeResult(
  db: PGlite,
  query: string,
  params?: any[],
): UnsafeResult {
  // Cache the promise so both .values() and .then() share the same query
  let resultPromise: Promise<any> | null = null;

  function getResult() {
    if (!resultPromise) {
      resultPromise = db.query(query, params ?? []);
    }
    return resultPromise;
  }

  const result: UnsafeResult = {
    values(): Promise<any[][]> {
      return getResult().then((res: any) => {
        // PGLite returns { rows: Record<string, any>[], fields: { name }[] }
        // We need rows as arrays of values in column order.
        if (!res.rows || res.rows.length === 0) {
          return [];
        }

        const fields = res.fields as { name: string }[];

        return res.rows.map((row: Record<string, any>) =>
          fields.map((f) => row[f.name]),
        );
      });
    },
    // Allow awaiting the result directly — returns rows as objects (like postgres.js)
    then(onFulfilled, onRejected) {
      return getResult()
        .then((res: any) => res.rows ?? [])
        .then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return getResult()
        .then((res: any) => res.rows ?? [])
        .catch(onRejected);
    },
  };

  return result;
}

/**
 * Build a tagged-template interpolated query from template literals.
 * Converts sql`SELECT * FROM users WHERE id = ${id}` into
 * a parameterized query: "SELECT * FROM users WHERE id = $1"
 */
function buildTaggedQuery(
  strings: TemplateStringsArray,
  values: unknown[],
): { query: string; params: unknown[] } {
  let query = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    query += `$${i + 1}${strings[i + 1] ?? ""}`;
  }
  return { query, params: values };
}

/**
 * Create a PGLite-backed object that conforms to the postgres.js Sql interface
 * well enough for sqlc-generated code to work.
 */
export function createPGLiteAdapter(db: PGlite): PGLiteAsSql {
  // The adapter itself is a callable (tagged template function) with methods
  const adapter = function taggedTemplate(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<any[]> {
    const { query, params } = buildTaggedQuery(strings, values);
    return db.query(query, params).then((res: any) => res.rows ?? []);
  } as PGLiteAsSql;

  // Attach the unsafe() method that sqlc uses
  adapter.unsafe = (query: string, params?: any[]) => {
    return createUnsafeResult(db, query, params);
  };

  // Attach end() for cleanup
  adapter.end = async () => {
    await db.close();
  };

  return adapter;
}

/**
 * Create and initialize a PGLite instance with optional data directory.
 *
 * @param dataDir - Directory for persistent storage, or undefined for in-memory
 * @returns Initialized PGLite instance
 */
export async function createPGLiteInstance(
  dataDir?: string,
): Promise<PGlite> {
  const options: PGliteOptions = {};

  if (dataDir) {
    const db = new PGlite(dataDir, options);
    await db.waitReady;
    return db;
  }

  // In-memory mode (useful for tests)
  const db = new PGlite(options);
  await db.waitReady;
  return db;
}
