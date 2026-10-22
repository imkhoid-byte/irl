import { one, run, type Db } from "../db";
import { now } from "@/lib/time";
import { AppError } from "../errors";

/** Fixed-window limiter persisted in the database so it survives dev reloads. */
export function rateLimit(db: Db, key: string, limit: number, windowMs: number) {
  const t = now().getTime();
  const windowStart = t - (t % windowMs);
  const row = one<{ window_start: number; count: number }>(db, "SELECT window_start, count FROM rate_limit_buckets WHERE key = ?", key);
  if (!row || row.window_start !== windowStart) {
    run(db, "INSERT INTO rate_limit_buckets (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1", key, windowStart);
    return;
  }
  if (row.count >= limit) throw new AppError("rate_limited", "Too many attempts. Please wait a few minutes and try again.", 429);
  run(db, "UPDATE rate_limit_buckets SET count = count + 1 WHERE key = ?", key);
}
