// Deletes the local demo database and reseeds it. Usage: npm run db:reset
import fs from "node:fs";
import { defaultDbPath, openDb } from "../src/server/db";
import { seed } from "../src/server/db/seed";

const file = defaultDbPath();
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
const db = openDb(file);
seed(db);
db.close();
console.log(`Reseeded demo database at ${file}`);
