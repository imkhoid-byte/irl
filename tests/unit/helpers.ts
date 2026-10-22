import { openDb, one, type Db } from "@/server/db";
import { seed, DEMO_USERS } from "@/server/db/seed";
import { createCtx, type Ctx } from "@/server/context";
import { setNowForTests } from "@/lib/time";
import type { BookingRequest } from "@/server/providers/booking";

export const T0 = new Date("2026-10-19T14:00:00Z"); // a Monday

export function setup(opts: { bookingFailFor?: (r: BookingRequest) => boolean } = {}): Ctx & { users: Record<string, string> } {
  setNowForTests(T0);
  const db: Db = openDb(":memory:");
  seed(db);
  const uid = (email: string) => one<{ id: string }>(db, "SELECT id FROM users WHERE email = ?", email)!.id;
  const users = {
    ava: uid(DEMO_USERS.ava),
    ben: uid(DEMO_USERS.ben),
    admin: uid(DEMO_USERS.admin),
    elena: uid("elena@demo.once.date"),
    chloe: uid("chloe@demo.once.date"),
    marcus: uid("marcus@demo.once.date"),
    jordan: uid("jordan@demo.once.date"),
  };
  return { ...createCtx(db, opts), users };
}

/** A bookable slot for an experience, at least `minHoursAhead` away. */
export function slotFor(db: Db, slug: string, minHoursAhead = 30): string {
  const at = new Date(T0.getTime() + minHoursAhead * 3600_000).toISOString();
  return one<{ id: string }>(
    db,
    "SELECT s.id FROM availability_slots s JOIN date_experiences e ON e.id = s.experience_id WHERE e.slug = ? AND s.starts_at > ? ORDER BY s.starts_at LIMIT 1",
    slug, at,
  )!.id;
}

let n = 0;
export const key = () => `test-key-${Date.now()}-${n++}`;
