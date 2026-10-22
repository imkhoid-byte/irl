import "server-only";
import { defaultDbPath, openDb, type Db } from "./index";
import { seedIfEmpty } from "./seed";

const globalForDb = globalThis as unknown as { __onceDb?: Db; __onceDbPath?: string };

/** The process-wide database. Seeds demo data on first open. */
export function getDb(): Db {
  const file = defaultDbPath();
  if (globalForDb.__onceDb && globalForDb.__onceDbPath === file) return globalForDb.__onceDb;
  const db = openDb(file);
  seedIfEmpty(db);
  globalForDb.__onceDb = db;
  globalForDb.__onceDbPath = file;
  return db;
}
