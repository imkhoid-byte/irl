import { all, one, run, tx } from "../db";
import type { Ctx } from "../context";
import { addHours, addMinutes, formatDateTime, now, nowIso } from "@/lib/time";
import { cancellationDeadline, cancellationOutcome, type CancelKind, type CancellationOutcome } from "@/lib/policy";
import { formatMoney } from "@/lib/money";
import { AppError } from "../errors";
import { audit } from "./audit";
import { notify, notifyBoth } from "./notifications";
import { currentTerms, getMatchRow, hashTerms, latestIntent, participantsOf, requireParticipant, type IntentRow, type MatchRow } from "./dates";
import { ensureDemoInventory, getOpportunity } from "./discovery";
import { refundIntent, releaseInventory, voidAuthorizations } from "./payments";

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export type CancellationPreview =
  | { stage: "unconfirmed"; summary: string }
  | { stage: "confirmed"; mine: CancellationOutcome; other: CancellationOutcome; beforeDeadline: boolean };

function outcomesFor(ctx: Ctx, match: MatchRow, cancellerId: string | null, kind: CancelKind, userId: string): CancellationOutcome {
  const opp = getOpportunity(ctx.db, match.slot_id)!;
  return cancellationOutcome({
    now: now(),
    deadline: new Date(match.cancellation_deadline),
    startsAt: new Date(opp.startsAt),
    kind,
    isCanceller: cancellerId === userId,
    shareCents: match.share_cents,
    feeCents: match.fee_cents,
    lateRefundPct: match.late_refund_pct,
  });
}

export function cancellationPreview(ctx: Ctx, userId: string, matchId: string): CancellationPreview {
  const { match, other } = requireParticipant(ctx.db, userId, matchId);
  if (match.status === "awaiting_commitment") return { stage: "unconfirmed", summary: "Neither of you will be charged. Any payment hold is released straight away." };
  if (match.status !== "confirmed") throw new AppError("not_cancellable", "This date can't be cancelled.");
  return {
    stage: "confirmed",
    mine: outcomesFor(ctx, match, userId, "participant", userId),
    other: outcomesFor(ctx, match, userId, "participant", other.user_id),
    beforeDeadline: nowIso() < match.cancellation_deadline,
  };
}

/**
 * Cancel a date. Before both commit, holds are simply released. After
 * confirmation, refunds follow the published policy for each person.
 */
export async function cancelMatch(ctx: Ctx, actorId: string | null, matchId: string, opts: { kind?: CancelKind; reason?: string } = {}) {
  const { db } = ctx;
  const kind = opts.kind ?? "participant";
  const plan = tx(db, () => {
    const match = getMatchRow(db, matchId);
    if (!match) throw new AppError("not_found", "We couldn't find that date.", 404);
    const parts = participantsOf(db, matchId);
    if (actorId && kind === "participant" && !parts.some((p) => p.user_id === actorId)) throw new AppError("not_found", "We couldn't find that date.", 404);
    if (match.status !== "awaiting_commitment" && match.status !== "confirmed") throw new AppError("not_cancellable", "This date can't be cancelled any more.");
    if (match.finalizing_at) throw new AppError("busy", "This date is being confirmed right now. Try again in a moment.");

    const refunds: { intent: IntentRow; outcome: CancellationOutcome }[] = [];
    if (match.status === "confirmed") {
      for (const p of parts) {
        const outcome = outcomesFor(ctx, match, actorId, kind, p.user_id); // throws if the date already started
        const intent = latestIntent(db, matchId, p.user_id);
        if (intent && intent.status === "captured") refunds.push({ intent, outcome });
      }
    }
    const t = nowIso();
    run(db, "UPDATE matches SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancel_reason = ?, updated_at = ? WHERE id = ?", t, actorId, opts.reason ?? kind, t, matchId);
    run(db, "UPDATE reschedule_requests SET status = 'withdrawn', responded_at = ? WHERE match_id = ? AND status = 'pending'", t, matchId);
    const bookingRef = one<{ provider_ref: string | null }>(db, "SELECT provider_ref FROM reservations WHERE match_id = ?", matchId)?.provider_ref ?? null;
    releaseInventory(ctx, matchId, match.slot_id, match.status === "confirmed" ? "cancelled" : "released");
    audit(db, actorId, "match.cancelled", "match", matchId, { kind, from: match.status, refunds: refunds.map((r) => ({ intent: r.intent.id, refundCents: r.outcome.refundCents })) });
    return { match, parts, refunds, bookingRef };
  });

  if (plan.match.status === "awaiting_commitment") {
    await voidAuthorizations(ctx, matchId);
  } else {
    for (const r of plan.refunds) if (r.outcome.refundCents > 0) await refundIntent(ctx, r.intent.id, r.outcome.refundCents, `cancel-${matchId}`);
    if (plan.bookingRef) await ctx.booking.cancel(plan.bookingRef).catch(() => {});
  }

  const opp = getOpportunity(db, plan.match.slot_id)!;
  for (const p of plan.parts) {
    const r = plan.refunds.find((x) => x.intent.user_id === p.user_id);
    const money = plan.match.status === "awaiting_commitment" ? "Nothing was charged." : r ? `${formatMoney(r.outcome.refundCents)} refunded. ${r.outcome.summary}` : "";
    notify(db, p.user_id, {
      kind: "date_cancelled",
      title: p.user_id === actorId ? "You cancelled your date" : "Your date was cancelled",
      body: `${opp.title} · ${formatDateTime(opp.startsAt)}. ${money}`.trim(),
      link: `/matches/${matchId}`,
      dedupeKey: `cancelled:${matchId}:${p.user_id}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Rescheduling response
// ---------------------------------------------------------------------------

export async function respondToReschedule(ctx: Ctx, userId: string, requestId: string, accept: boolean) {
  const { db } = ctx;
  const req = one<{ id: string; match_id: string; requested_by: string; new_slot_id: string; status: string }>(db, "SELECT * FROM reschedule_requests WHERE id = ?", requestId);
  if (!req) throw new AppError("not_found", "We couldn't find that request.", 404);
  const { match } = requireParticipant(db, userId, req.match_id);
  if (req.requested_by === userId) throw new AppError("forbidden", "The other person needs to answer this request.", 403);
  if (req.status !== "pending") throw new AppError("not_pending", "This request has already been answered.");

  if (!accept) {
    run(db, "UPDATE reschedule_requests SET status = 'declined', responded_at = ? WHERE id = ? AND status = 'pending'", nowIso(), requestId);
    notify(db, req.requested_by, { kind: "reschedule_declined", title: "Your original time stands", body: "The time change wasn't accepted, so your date stays as planned.", link: `/matches/${match.id}` });
    return;
  }

  // 1. Hold the new slot.
  tx(db, () => {
    if (match.status !== "confirmed") throw new AppError("not_confirmed", "This date can no longer be moved.");
    const held = run(db, "UPDATE availability_slots SET reserved_count = reserved_count + 1, updated_at = ? WHERE id = ? AND status = 'open' AND reserved_count < capacity AND starts_at > ?", nowIso(), req.new_slot_id, nowIso());
    if (held.changes !== 1) {
      run(db, "UPDATE reschedule_requests SET status = 'expired', responded_at = ? WHERE id = ?", nowIso(), requestId);
      throw new AppError("full", "That new time has filled up. Your original date is unchanged.");
    }
  });
  // 2. Book it with the venue.
  const reservation = one<{ id: string; provider_ref: string | null }>(db, "SELECT id, provider_ref FROM reservations WHERE match_id = ?", match.id)!;
  let booking: { providerRef: string; confirmationCode: string };
  try {
    booking = await ctx.booking.secure({ reservationId: reservation.id, experienceId: match.experience_id, startsAt: getOpportunity(db, req.new_slot_id)!.startsAt, partySize: 2, venueNotes: [], idempotencyKey: `secure:${reservation.id}:${req.new_slot_id}` });
  } catch {
    tx(db, () => {
      run(db, "UPDATE availability_slots SET reserved_count = MAX(reserved_count - 1, 0) WHERE id = ?", req.new_slot_id);
      run(db, "UPDATE reschedule_requests SET status = 'expired', responded_at = ? WHERE id = ?", nowIso(), requestId);
    });
    throw new AppError("venue", "The venue couldn't take that time. Your original date is unchanged.");
  }
  // 3. Switch the date over and release the old slot. Both people agreed, so the new terms are confirmed for both.
  tx(db, () => {
    const t = nowIso();
    const exp = one<{ cancellation_hours: number }>(db, "SELECT cancellation_hours FROM date_experiences WHERE id = ?", match.experience_id)!;
    const newStart = getOpportunity(db, req.new_slot_id)!.startsAt;
    const deadline = cancellationDeadline(newStart, exp.cancellation_hours).toISOString();
    run(db, "UPDATE availability_slots SET reserved_count = MAX(reserved_count - 1, 0), updated_at = ? WHERE id = ?", t, match.slot_id);
    run(db, "UPDATE matches SET slot_id = ?, cancellation_deadline = ?, updated_at = ? WHERE id = ?", req.new_slot_id, deadline, t, match.id);
    const updated = getMatchRow(db, match.id)!;
    const hash = hashTerms(currentTerms(db, updated));
    run(db, "UPDATE matches SET terms_hash = ? WHERE id = ?", hash, match.id);
    run(db, "UPDATE match_participants SET details_confirmed_hash = ?, details_confirmed_at = ?, attendance_confirmed_at = NULL WHERE match_id = ?", hash, t, match.id);
    run(db, "UPDATE reservations SET slot_id = ?, provider_ref = ?, confirmation_code = ?, updated_at = ? WHERE id = ?", req.new_slot_id, booking.providerRef, booking.confirmationCode, t, reservation.id);
    run(db, "UPDATE reschedule_requests SET status = 'accepted', responded_at = ? WHERE id = ?", t, requestId);
    notifyBoth(db, participantsOf(db, match.id).map((p) => p.user_id), {
      kind: "reschedule_accepted",
      title: "Your date has moved",
      body: `New time: ${formatDateTime(newStart)}. Same plan, same price.`,
      link: `/matches/${match.id}`,
      dedupeKey: `moved:${requestId}`,
    });
    audit(db, userId, "match.rescheduled", "match", match.id, { from: match.slot_id, to: req.new_slot_id });
  });
  if (reservation.provider_ref) await ctx.booking.cancel(reservation.provider_ref).catch(() => {});
}

// ---------------------------------------------------------------------------
// Sweep: expiries, reminders and completion. Runs on page loads (throttled)
// and from /api/cron/sweep.
// ---------------------------------------------------------------------------

export async function sweep(ctx: Ctx) {
  const { db } = ctx;
  const t = nowIso();
  ensureDemoInventory(db);

  // Invitations past their reply window.
  const expiredInvites = all<{ id: string; from_user_id: string; to_user_id: string }>(db, "SELECT id, from_user_id, to_user_id FROM date_invitations WHERE status = 'pending' AND expires_at <= ?", t);
  for (const inv of expiredInvites) {
    if (run(db, "UPDATE date_invitations SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending'", t, inv.id).changes === 1) {
      notify(db, inv.from_user_id, { kind: "invitation_expired", title: "An invitation expired", body: "No reply in time, so nothing happens and nobody is charged.", link: "/my-dates" });
    }
  }

  // Matches where someone didn't commit in time.
  const lapsed = all<{ id: string; slot_id: string }>(db, "SELECT id, slot_id FROM matches WHERE status = 'awaiting_commitment' AND finalizing_at IS NULL AND commitment_expires_at <= ?", t);
  for (const m of lapsed) {
    const done = tx(db, () => {
      if (run(db, "UPDATE matches SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'awaiting_commitment' AND finalizing_at IS NULL", t, m.id).changes !== 1) return false;
      releaseInventory(ctx, m.id, m.slot_id, "released");
      audit(db, null, "match.expired", "match", m.id);
      return true;
    });
    if (!done) continue;
    await voidAuthorizations(ctx, m.id);
    notifyBoth(db, participantsOf(db, m.id).map((p) => p.user_id), {
      kind: "match_expired",
      title: "This date didn't come together",
      body: "Both commitments weren't completed in time. Any payment hold has been released — nobody was charged.",
      link: `/matches/${m.id}`,
      dedupeKey: `expired:${m.id}`,
    });
  }

  // Reminders and completion for confirmed dates.
  const confirmed = all<{ id: string; slot_id: string; starts_at: string; duration_minutes: number; title: string }>(
    db,
    `SELECT m.id, m.slot_id, s.starts_at, e.duration_minutes, e.title FROM matches m
       JOIN availability_slots s ON s.id = m.slot_id JOIN date_experiences e ON e.id = m.experience_id
      WHERE m.status = 'confirmed'`,
  );
  for (const m of confirmed) {
    const users = participantsOf(db, m.id).map((p) => p.user_id);
    const start = new Date(m.starts_at);
    const end = addMinutes(start, m.duration_minutes);
    if (end <= now()) {
      if (run(db, "UPDATE matches SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'confirmed'", t, t, m.id).changes === 1) {
        notifyBoth(db, users, { kind: "checkin_due", title: "How did it go?", body: "Two minutes, completely private. Your answers are never shown to your date.", link: `/matches/${m.id}/check-in`, dedupeKey: `checkin:${m.id}` });
      }
    } else if (start <= addHours(now(), 2)) {
      notifyBoth(db, users, { kind: "reminder_2h", title: "Your date is in 2 hours", body: `${m.title} at ${formatDateTime(m.starts_at)}. Arrival details are on your itinerary.`, link: `/matches/${m.id}`, dedupeKey: `r2:${m.id}` });
    } else if (start <= addHours(now(), 24)) {
      notifyBoth(db, users, { kind: "reminder_24h", title: "Tomorrow: your date", body: `${m.title} at ${formatDateTime(m.starts_at)}. Tap “I'll be there” so you both know.`, link: `/matches/${m.id}`, dedupeKey: `r24:${m.id}` });
    }
  }
}

let lastSweep = 0;
/** Throttled sweep for request paths. */
export async function maybeSweep(ctx: Ctx) {
  if (Date.now() - lastSweep < 30_000) return;
  lastSweep = Date.now();
  try {
    await sweep(ctx);
  } catch (e) {
    console.error("sweep failed", e);
  }
}

/**
 * DEMO ONLY: pretend a confirmed date has already happened, so the post-date
 * flow can be tried without waiting. Unavailable when real payments are on.
 */
export function simulateDateHappened(ctx: Ctx, userId: string, matchId: string) {
  if (process.env.PAYMENT_PROVIDER === "stripe") throw new AppError("forbidden", "Not available outside demo mode.", 403);
  const { match } = requireParticipant(ctx.db, userId, matchId);
  if (match.status !== "confirmed") throw new AppError("not_confirmed", "Only confirmed dates can be fast-forwarded.");
  const t = nowIso();
  run(ctx.db, "UPDATE matches SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'confirmed'", t, t, matchId);
  notifyBoth(ctx.db, participantsOf(ctx.db, matchId).map((p) => p.user_id), { kind: "checkin_due", title: "How did it go?", body: "Two minutes, completely private. (Demo: this date was fast-forwarded.)", link: `/matches/${matchId}/check-in`, dedupeKey: `checkin:${matchId}` });
  audit(ctx.db, userId, "demo.date_fast_forwarded", "match", matchId);
}
