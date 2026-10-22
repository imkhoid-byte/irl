import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

export type Db = DatabaseSync;
type Param = SQLInputValue | boolean | undefined;

/** Serverless hosts (Netlify, Vercel, AWS Lambda) only allow writes under /tmp. */
export function isServerless(): boolean {
  return !!(process.env.NETLIFY || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Writable directory for the demo database and uploads. */
export function dataDir(): string {
  return isServerless() ? "/tmp/once" : path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
}

export function defaultDbPath(): string {
  return process.env.ONCE_DB_PATH ?? path.join(/*turbopackIgnore: true*/ dataDir(), "once.db");
}

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

function norm(params: Param[]): SQLInputValue[] {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

export function one<T>(db: Db, sql: string, ...params: Param[]): T | undefined {
  const row = db.prepare(sql).get(...norm(params));
  // node:sqlite rows have a null prototype; copy into plain objects so they serialize anywhere.
  return (row ? { ...row } : undefined) as T | undefined;
}

export function all<T>(db: Db, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...norm(params)).map((r) => ({ ...r })) as T[];
}

export function run(db: Db, sql: string, ...params: Param[]): { changes: number } {
  const r = db.prepare(sql).run(...norm(params));
  return { changes: Number(r.changes) };
}

const depth = new WeakMap<Db, number>();

/**
 * Run fn atomically. The outermost call takes the write lock up front
 * (BEGIN IMMEDIATE), so two requests confirming the same date serialize instead
 * of interleaving. Nested calls become savepoints.
 */
export function tx<T>(db: Db, fn: () => T): T {
  const d = depth.get(db) ?? 0;
  const sp = `sp_${d}`;
  db.exec(d === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${sp}`);
  depth.set(db, d + 1);
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error("tx callbacks must be synchronous");
    db.exec(d === 0 ? "COMMIT" : `RELEASE ${sp}`);
    return result;
  } catch (e) {
    db.exec(d === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  } finally {
    depth.set(db, d);
  }
}

export function id(): string {
  return crypto.randomUUID();
}

export function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
