import { id, run, type Db } from "../db";
import { nowIso } from "@/lib/time";

export interface EmailProvider {
  readonly name: string;
  send(db: Db, message: { toUserId: string; subject: string; body: string }): void;
}

/**
 * Demo provider: writes to an outbox table (visible in the admin dashboard)
 * instead of sending. Swap for Resend/Postmark/SES in Phase 2.
 */
export const outboxEmailProvider: EmailProvider = {
  name: "demo-outbox",
  send(db, m) {
    run(db, "INSERT INTO outbound_emails (id, to_user_id, subject, body, created_at) VALUES (?, ?, ?, ?, ?)", id(), m.toUserId, m.subject, m.body, nowIso());
  },
};
