import { all, id, one, run, type Db } from "../db";
import { nowIso } from "@/lib/time";
import { outboxEmailProvider } from "../providers/email";

export type NotificationInput = {
  kind: string;
  title: string;
  body: string;
  link?: string;
  /** Prevents the same reminder or update being sent twice. */
  dedupeKey?: string;
};

export function notify(db: Db, userId: string, n: NotificationInput) {
  const res = run(
    db,
    "INSERT OR IGNORE INTO notifications (id, user_id, kind, title, body, link, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id(), userId, n.kind, n.title, n.body, n.link ?? null, n.dedupeKey ?? null, nowIso(),
  );
  if (res.changes === 0) return;
  const pref = one<{ email_notifications: number }>(db, "SELECT email_notifications FROM user_preferences WHERE user_id = ?", userId);
  if (pref?.email_notifications !== 0) outboxEmailProvider.send(db, { toUserId: userId, subject: n.title, body: n.body });
}

/** Both participants always receive identical date updates. */
export function notifyBoth(db: Db, userIds: string[], n: NotificationInput) {
  for (const u of userIds) notify(db, u, { ...n, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${u}` : undefined });
}

export type NotificationRow = { id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };

export function listNotifications(db: Db, userId: string): NotificationRow[] {
  return all<NotificationRow>(db, "SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", userId);
}

export function unreadCount(db: Db, userId: string): number {
  return one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", userId)?.n ?? 0;
}

export function markAllRead(db: Db, userId: string) {
  run(db, "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", nowIso(), userId);
}
