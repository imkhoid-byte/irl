import { z } from "zod";
import { all, id, one, run, tx } from "../db";
import type { Ctx } from "../context";
import { nowIso } from "@/lib/time";
import { REPORT_KINDS } from "@/lib/catalog";
import { AppError } from "../errors";
import { audit } from "./audit";
import { rateLimit } from "./ratelimit";
import { cancelMatch } from "./lifecycle";
import { haveConnection } from "./profiles";

const reportSchema = z.object({
  reportedUserId: z.string().uuid().optional(),
  matchId: z.string().uuid().optional(),
  kind: z.enum([...(Object.keys(REPORT_KINDS) as [keyof typeof REPORT_KINDS]), "emergency", "support"]),
  details: z.string().trim().max(2000).default(""),
});

/** Reports go to the trust & safety queue only. The reported person never sees who reported them or what was said. */
export function fileReport(ctx: Ctx, reporterId: string, input: unknown) {
  const { db } = ctx;
  rateLimit(db, `report:${reporterId}`, 20, 24 * 3600_000);
  const v = reportSchema.parse(input);
  if (v.reportedUserId === reporterId) throw new AppError("invalid", "You can't report yourself.");
  if (v.reportedUserId && !haveConnection(db, reporterId, v.reportedUserId)) throw new AppError("not_found", "We couldn't find that person.", 404);
  if (v.matchId && !one(db, "SELECT 1 FROM match_participants WHERE match_id = ? AND user_id = ?", v.matchId, reporterId)) throw new AppError("not_found", "We couldn't find that date.", 404);
  if (["harassment", "misconduct", "safety", "fake_profile", "other"].includes(v.kind) && !v.reportedUserId) throw new AppError("invalid", "Choose who you're reporting.");
  const reportId = id();
  const t = nowIso();
  run(db, "INSERT INTO reports (id, reporter_id, reported_user_id, match_id, kind, details, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)", reportId, reporterId, v.reportedUserId ?? null, v.matchId ?? null, v.kind, v.details, t, t);
  audit(db, reporterId, "report.filed", "report", reportId, { kind: v.kind });
  return reportId;
}

/**
 * Block someone: they disappear from discovery, can't be matched again, pending
 * invitations lapse, and any date between you is cancelled with full refunds
 * for both (a safety cancellation is nobody's late cancellation).
 */
export async function blockUser(ctx: Ctx, blockerId: string, blockedId: string) {
  const { db } = ctx;
  if (blockerId === blockedId) throw new AppError("invalid", "You can't block yourself.");
  if (!one(db, "SELECT 1 FROM users WHERE id = ?", blockedId)) throw new AppError("not_found", "We couldn't find that person.", 404);
  const shared = tx(db, () => {
    run(db, "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", blockerId, blockedId, nowIso());
    run(
      db,
      "UPDATE date_invitations SET status = 'cancelled', updated_at = ? WHERE status = 'pending' AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))",
      nowIso(), blockerId, blockedId, blockedId, blockerId,
    );
    audit(db, blockerId, "user.blocked", "user", blockedId);
    return all<{ id: string }>(
      db,
      `SELECT m.id FROM matches m
         JOIN match_participants a ON a.match_id = m.id AND a.user_id = ?
         JOIN match_participants b ON b.match_id = m.id AND b.user_id = ?
        WHERE m.status IN ('awaiting_commitment', 'confirmed')`,
      blockerId, blockedId,
    );
  });
  for (const m of shared) await cancelMatch(ctx, blockerId, m.id, { kind: "safety", reason: "safety" });
}

export function unblockUser(ctx: Ctx, blockerId: string, blockedId: string) {
  run(ctx.db, "DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?", blockerId, blockedId);
  audit(ctx.db, blockerId, "user.unblocked", "user", blockedId);
}

export function listBlocked(ctx: Ctx, userId: string) {
  return all<{ blocked_id: string; first_name: string; created_at: string }>(
    ctx.db,
    "SELECT b.blocked_id, COALESCE(p.first_name, 'Member') AS first_name, b.created_at FROM blocks b LEFT JOIN profiles p ON p.user_id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC",
    userId,
  );
}
