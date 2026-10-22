import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../db";

export interface FileStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

/** Local-disk storage for demo mode. Supabase Storage (private bucket) replaces this in Phase 2. */
export function localStorageProvider(root = path.join(/*turbopackIgnore: true*/ dataDir(), "uploads")): FileStorage {
  const resolve = (key: string) => {
    if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(key)) throw new Error("Invalid storage key");
    return path.join(/*turbopackIgnore: true*/ root, key);
  };
  return {
    async put(key, bytes) {
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(resolve(key), bytes);
    },
    async get(key) {
      try {
        return fs.readFileSync(resolve(key));
      } catch {
        return null;
      }
    },
    async remove(key) {
      fs.rmSync(resolve(key), { force: true });
    },
  };
}
