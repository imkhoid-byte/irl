import { z } from "zod";
import { id, one, run, tx } from "../db";
import type { Ctx } from "../context";
import { addHours, nowIso } from "@/lib/time";
import { POLICY } from "@/lib/policy";
import { AppError } from "../errors";
import { audit } from "./audit";
import { notify, notifyBoth } from "./notifications";
import { requireParticipant } from "./dates";

const yesNo = z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : v), z.boolean());

export const checkInSchema = z.object({
  attended: yesNo,
  otherAttended: yesNo,
  feltSafe: yesNo,
  openToAnother: yesNo,
  experienceRating: z.coerce.number().int().min(1).max(5),
  venueRating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(""),
});

/**
 * Each person answers independently and privately. Romantic interest is kept
 * separate from the venue/experience rating, and is only ever revealed as a
 * mutual yes.
 */
export function submitCheckIn(ctx: Ctx, userId: string, matchId: string, input: unknown) {
  const { db } = ctx;
  const v = checkInSchema.parse(input);
  return tx(db, () => {
    const { match, other } = requireParticipant(db, userId, matchId);
    if (match.status !== "completed") throw new AppError("not_completed", "You can check in after your date.");
    if (match.completed_at && addHours(match.completed_at, POLICY.checkInWindowDays * 24).toISOString() < nowIso())
      throw new AppError("closed", "The check-in window for this date has closed.");
    if (one(db, "SELECT 1 FROM post_date_feedback WHERE match_id = ? AND user_id = ?", matchId, userId)) throw new AppError("duplicate", "You've already checked in for this date.");
    const t = nowIso();
    run(db, "INSERT INTO attendance_confirmations (match_id, user_id, attended, other_attended, created_at) VALUES (?, ?, ?, ?, ?)", matchId, userId, v.attended ? 1 : 0, v.otherAttended ? 1 : 0, t);
    run(
      db,
      "INSERT INTO post_date_feedback (match_id, user_id, felt_safe, open_to_another, experience_rating, venue_rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      matchId, userId, v.feltSafe ? 1 : 0, v.openToAnother && v.attended && v.otherAttended ? 1 : 0, v.experienceRating, v.venueRating, v.comment || null, t,
    );

    if (!v.feltSafe) {
      run(db, "INSERT INTO reports (id, reporter_id, reported_user_id, match_id, kind, details, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'safety', ?, 'open', ?, ?)", id(), userId, other.user_id, matchId, v.comment || "Flagged in post-date check-in.", t, t);
    }
    if (v.attended && !v.otherAttended) {
      // A claim, not a verdict: reviewed by a person before it affects anyone.
      run(db, "INSERT INTO reports (id, reporter_id, reported_user_id, match_id, kind, details, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'no_show', ?, 'open', ?, ?)", id(), userId, other.user_id, matchId, "Reported in post-date check-in.", t, t);
      notify(db, other.user_id, {
        kind: "attendance_question",
        title: "A question about your recent date",
        body: "We're reviewing attendance for a recent date. If something came up — an emergency or a mix-up — tell us. Nothing changes without a review.",
        link: `/help?match=${matchId}`,
        dedupeKey: `attendance-q:${matchId}`,
      });
    }

    const both = one<{ n: number; yes: number }>(db, "SELECT COUNT(*) AS n, SUM(open_to_another) AS yes FROM post_date_feedback WHERE match_id = ?", matchId)!;
    if (both.n === 2 && both.yes === 2) {
      notifyBoth(db, [userId, other.user_id], { kind: "mutual_yes", title: "You both said yes", body: "See each other again? Pick another date together.", link: `/matches/${matchId}/again`, dedupeKey: `mutual:${matchId}` });
    }
    audit(db, userId, "feedback.submitted", "match", matchId);
    return { feltSafe: v.feltSafe };
  });
}
