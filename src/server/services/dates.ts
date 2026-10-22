import crypto from "node:crypto";
import { all, id, one, run, tx, type Db } from "../db";
import { addHours, formatDateTime, minDate, now, nowIso } from "@/lib/time";
import { POLICY, cancellationDeadline } from "@/lib/policy";
import { AppError, notFound } from "../errors";
import { audit } from "./audit";
import { notify, notifyBoth } from "./notifications";
import { getLateRefundPct, getServiceFeeCents } from "./settings";
import { busyAt, getOpportunity, isBookable, type Opportunity } from "./discovery";
import { getOwnProfile, pairEligibility, toPublic, type PublicProfile } from "./profiles";
import { rateLimit } from "./ratelimit";

// ---------------------------------------------------------------------------
// Terms: the exact plan both people agree to. Any change produces a new hash,
// so nobody can be held to details they didn't see.
// ---------------------------------------------------------------------------

export type Terms = {
  experienceId: string;
  slotId: string;
  startsAt: string;
  totalPriceCents: number;
  shareCents: number;
  feeCents: number;
  cancellationDeadline: string;
  lateRefundPct: number;
};

export function hashTerms(t: Terms): string {
  const ordered = Object.fromEntries(Object.entries(t).sort(([a], [b]) => a.localeCompare(b)));
  return crypto.createHash("sha256").update(JSON.stringify(ordered)).digest("hex").slice(0, 32);
}

function termsFor(opp: Opportunity, feeCents: number, lateRefundPct: number): Terms {
  return {
    experienceId: opp.experienceId,
    slotId: opp.slotId,
    startsAt: opp.startsAt,
    totalPriceCents: opp.price.totalCents,
    shareCents: opp.price.shareCents,
    feeCents,
    cancellationDeadline: opp.cancellationDeadline,
    lateRefundPct,
  };
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export function sendInvitation(db: Db, fromId: string, input: { slotId: string; toUserId: string; repeatOfMatchId?: string }) {
  rateLimit(db, `invite:${fromId}`, POLICY.maxInvitesPerDay, 24 * 3600_000);
  return tx(db, () => {
    const from = getOwnProfile(db, fromId);
    const to = getOwnProfile(db, input.toUserId);
    const repeat = !!input.repeatOfMatchId;
    if (repeat && !mutualYes(db, input.repeatOfMatchId!, fromId, input.toUserId)) {
      throw new AppError("not_mutual", "A second date needs both of you to have said yes.");
    }
    const elig = pairEligibility(db, from, to, { repeat });
    if (!elig.ok) throw new AppError("ineligible", elig.reason);

    const opp = getOpportunity(db, input.slotId, fromId);
    if (!opp || opp.status !== "open") throw new AppError("unavailable", "This date is no longer available.");
    if (!isBookable(opp.startsAt)) throw new AppError("too_soon", `Dates need at least ${POLICY.minLeadHours} hours' notice.`);
    if (opp.datesLeft < 1) throw new AppError("full", "This time just filled up. Try another slot.");

    const pending = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM date_invitations WHERE from_user_id = ? AND status = 'pending'", fromId)!.n;
    if (pending >= POLICY.maxPendingOutgoingInvites)
      throw new AppError("too_many", `You have ${pending} invitations waiting for a reply. Give people a chance to answer first.`);
    if (busyAt(db, fromId, opp.startsAt)) throw new AppError("busy", "You already have a date around that time.");
    if (busyAt(db, input.toUserId, opp.startsAt)) throw new AppError("busy", "That person isn't available then.");

    const reverse = one<{ id: string }>(db, "SELECT id FROM date_invitations WHERE slot_id = ? AND from_user_id = ? AND to_user_id = ? AND status = 'pending'", input.slotId, input.toUserId, fromId);
    if (reverse) throw new AppError("already_invited_you", "They've already invited you to this date — check My Dates to accept.");

    const expiresAt = minDate(addHours(now(), POLICY.invitationTtlHours), addHours(opp.startsAt, -6));
    const invitationId = id();
    const t = nowIso();
    try {
      run(
        db,
        `INSERT INTO date_invitations (id, slot_id, from_user_id, to_user_id, status, is_repeat, previous_match_id, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        invitationId, input.slotId, fromId, input.toUserId, repeat ? 1 : 0, input.repeatOfMatchId ?? null, expiresAt.toISOString(), t, t,
      );
    } catch (e) {
      if (String(e).includes("UNIQUE")) throw new AppError("duplicate", "You've already invited them to this date.");
      throw e;
    }
    notify(db, input.toUserId, {
      kind: "invitation_received",
      title: repeat ? `${from!.firstName} would like to see you again` : `${from!.firstName} invited you on a date`,
      body: `${opp.title} · ${formatDateTime(opp.startsAt)}. Reply before it expires.`,
      link: `/invitations/${invitationId}`,
    });
    audit(db, fromId, "invitation.sent", "date_invitation", invitationId, { slotId: input.slotId, repeat });
    return invitationId;
  });
}

type InvitationRow = {
  id: string;
  slot_id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  is_repeat: number;
  expires_at: string;
  created_at: string;
  match_id: string | null;
};

export type InvitationView = {
  id: string;
  status: string;
  direction: "received" | "sent";
  isRepeat: boolean;
  expiresAt: string;
  createdAt: string;
  matchId: string | null;
  opportunity: Opportunity;
  other: PublicProfile;
};

function invitationView(db: Db, viewerId: string, r: InvitationRow): InvitationView | null {
  const otherId = r.from_user_id === viewerId ? r.to_user_id : r.from_user_id;
  const opp = getOpportunity(db, r.slot_id, viewerId);
  const viewer = getOwnProfile(db, viewerId);
  const other = getOwnProfile(db, otherId);
  if (!opp || !other) return null;
  return {
    id: r.id,
    status: r.status,
    direction: r.to_user_id === viewerId ? "received" : "sent",
    isRepeat: !!r.is_repeat,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    matchId: r.match_id,
    opportunity: opp,
    other: toPublic(other, viewer),
  };
}

const INVITATION_SELECT = `SELECT i.*, m.id AS match_id FROM date_invitations i LEFT JOIN matches m ON m.invitation_id = i.id`;

export function getInvitation(db: Db, viewerId: string, invitationId: string): InvitationView {
  const r = one<InvitationRow>(db, `${INVITATION_SELECT} WHERE i.id = ? AND (i.from_user_id = ? OR i.to_user_id = ?)`, invitationId, viewerId, viewerId);
  // Same response whether it doesn't exist or isn't yours.
  const v = r && invitationView(db, viewerId, r);
  if (!v) throw notFound("that invitation");
  return v;
}

export function listInvitations(db: Db, viewerId: string): InvitationView[] {
  return all<InvitationRow>(
    db,
    `${INVITATION_SELECT} WHERE (i.from_user_id = ? OR i.to_user_id = ?) AND i.status IN ('pending', 'declined', 'expired', 'withdrawn', 'cancelled')
      AND i.updated_at >= ? ORDER BY i.created_at DESC LIMIT 50`,
    viewerId, viewerId, addHours(now(), -24 * 14).toISOString(),
  )
    .map((r) => invitationView(db, viewerId, r))
    .filter((v): v is InvitationView => !!v);
}

export function withdrawInvitation(db: Db, userId: string, invitationId: string) {
  const r = run(db, "UPDATE date_invitations SET status = 'withdrawn', updated_at = ? WHERE id = ? AND from_user_id = ? AND status = 'pending'", nowIso(), invitationId, userId);
  if (r.changes !== 1) throw new AppError("not_pending", "This invitation can no longer be withdrawn.");
  audit(db, userId, "invitation.withdrawn", "date_invitation", invitationId);
}

/**
 * Accept or decline. Accepting creates the match and holds inventory in one
 * transaction: conditional updates guarantee that concurrent accepts can't
 * produce two matches, and a slot can never be oversold.
 */
export function respondToInvitation(db: Db, userId: string, invitationId: string, accept: boolean): { matchId: string | null } {
  return tx(db, () => {
    const inv = one<InvitationRow>(db, "SELECT * FROM date_invitations WHERE id = ? AND to_user_id = ?", invitationId, userId);
    if (!inv) throw notFound("that invitation");
    if (inv.status !== "pending") throw new AppError("not_pending", "This invitation has already been answered or has expired.");
    const t = nowIso();
    if (inv.expires_at <= t) {
      run(db, "UPDATE date_invitations SET status = 'expired', updated_at = ? WHERE id = ?", t, inv.id);
      throw new AppError("expired", "This invitation has expired.");
    }

    if (!accept) {
      run(db, "UPDATE date_invitations SET status = 'declined', responded_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'", t, t, inv.id);
      const opp = getOpportunity(db, inv.slot_id);
      // Kind and private: no reason is shared.
      notify(db, inv.from_user_id, { kind: "invitation_declined", title: "Not this time", body: `Your invitation for ${opp?.title ?? "a date"} wasn't accepted. There are more dates worth leaving home for.`, link: "/discover" });
      audit(db, userId, "invitation.declined", "date_invitation", inv.id);
      return { matchId: null };
    }

    const from = getOwnProfile(db, inv.from_user_id);
    const to = getOwnProfile(db, userId);
    const elig = pairEligibility(db, from, to, { repeat: !!inv.is_repeat });
    if (!elig.ok) throw new AppError("ineligible", elig.reason);
    const opp = getOpportunity(db, inv.slot_id);
    if (!opp || opp.status !== "open" || !isBookable(opp.startsAt)) {
      run(db, "UPDATE date_invitations SET status = 'cancelled', updated_at = ? WHERE id = ?", t, inv.id);
      throw new AppError("unavailable", "This date is no longer available.");
    }
    if (busyAt(db, inv.from_user_id, opp.startsAt) || busyAt(db, userId, opp.startsAt)) {
      throw new AppError("busy", "One of you already has a date around that time.");
    }

    // Race guard 1: only one accept can move the invitation out of 'pending'.
    const claimed = run(db, "UPDATE date_invitations SET status = 'accepted', responded_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'", t, t, inv.id);
    if (claimed.changes !== 1) throw new AppError("not_pending", "This invitation has already been answered.");
    // Race guard 2: hold one unit of inventory only if one is left.
    const held = run(db, "UPDATE availability_slots SET reserved_count = reserved_count + 1, updated_at = ? WHERE id = ? AND status = 'open' AND reserved_count < capacity", t, inv.slot_id);
    if (held.changes !== 1) throw new AppError("full", "Sorry — this time just filled up. Nothing was charged.");

    const fee = getServiceFeeCents(db);
    const terms = termsFor(opp, fee, getLateRefundPct(db));
    const commitmentExpiresAt = minDate(addHours(now(), POLICY.commitmentWindowHours), addHours(opp.startsAt, -4));
    const matchId = id();
    run(
      db,
      `INSERT INTO matches (id, invitation_id, slot_id, experience_id, status, terms_hash, total_price_cents, share_cents, fee_cents, late_refund_pct, cancellation_deadline, commitment_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'awaiting_commitment', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      matchId, inv.id, inv.slot_id, opp.experienceId, hashTerms(terms), terms.totalPriceCents, terms.shareCents, fee, terms.lateRefundPct, terms.cancellationDeadline, commitmentExpiresAt.toISOString(), t, t,
    );
    run(db, "INSERT INTO match_participants (match_id, user_id, role) VALUES (?, ?, 'inviter')", matchId, inv.from_user_id);
    run(db, "INSERT INTO match_participants (match_id, user_id, role) VALUES (?, ?, 'invitee')", matchId, userId);
    run(
      db,
      "INSERT INTO reservations (id, match_id, slot_id, status, provider, hold_expires_at, created_at, updated_at) VALUES (?, ?, ?, 'held', 'mock-venue', ?, ?, ?)",
      id(), matchId, inv.slot_id, commitmentExpiresAt.toISOString(), t, t,
    );

    // Neither person can be double-booked: other pending invitations around this time lapse.
    const lo = addHours(opp.startsAt, -3).toISOString();
    const hi = addHours(opp.startsAt, 3).toISOString();
    run(
      db,
      `UPDATE date_invitations SET status = 'cancelled', updated_at = ?
        WHERE status = 'pending' AND id <> ? AND (from_user_id IN (?, ?) OR to_user_id IN (?, ?))
          AND slot_id IN (SELECT id FROM availability_slots WHERE starts_at BETWEEN ? AND ?)`,
      t, inv.id, inv.from_user_id, userId, inv.from_user_id, userId, lo, hi,
    );

    notify(db, inv.from_user_id, {
      kind: "invitation_accepted",
      title: `${to!.firstName} said yes`,
      body: `${opp.title} · ${formatDateTime(opp.startsAt)}. Confirm the details and commit your share to lock it in.`,
      link: `/matches/${matchId}`,
    });
    notify(db, userId, {
      kind: "commitment_needed",
      title: "Lock in your date",
      body: `Confirm the details and commit your share for ${opp.title}. Neither of you is charged unless you both commit.`,
      link: `/matches/${matchId}`,
    });
    audit(db, userId, "invitation.accepted", "match", matchId, { invitationId: inv.id, slotId: inv.slot_id });
    return { matchId };
  });
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export type MatchRow = {
  id: string;
  invitation_id: string;
  slot_id: string;
  experience_id: string;
  status: "awaiting_commitment" | "confirmed" | "completed" | "cancelled" | "expired";
  terms_hash: string;
  total_price_cents: number;
  share_cents: number;
  fee_cents: number;
  late_refund_pct: number;
  cancellation_deadline: string;
  commitment_expires_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  finalizing_at: string | null;
  is_test: number;
  created_at: string;
};

export type ParticipantRow = {
  match_id: string;
  user_id: string;
  role: "inviter" | "invitee";
  details_confirmed_hash: string | null;
  details_confirmed_at: string | null;
  attendance_confirmed_at: string | null;
};

export type IntentRow = {
  id: string;
  match_id: string;
  user_id: string;
  provider: string;
  provider_ref: string | null;
  amount_cents: number;
  share_cents: number;
  fee_cents: number;
  status: "processing" | "authorized" | "captured" | "failed" | "canceled" | "refunded" | "partially_refunded";
  failure_reason: string | null;
  refunded_cents: number;
  authorization_expires_at: string | null;
  is_test: number;
  created_at: string;
};

export function getMatchRow(db: Db, matchId: string) {
  return one<MatchRow>(db, "SELECT * FROM matches WHERE id = ?", matchId);
}

export function participantsOf(db: Db, matchId: string) {
  return all<ParticipantRow>(db, "SELECT * FROM match_participants WHERE match_id = ? ORDER BY role", matchId);
}

/** The participant's most recent payment attempt for this match. */
export function latestIntent(db: Db, matchId: string, userId: string) {
  return one<IntentRow>(db, "SELECT * FROM payment_intents WHERE match_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", matchId, userId);
}

export function requireParticipant(db: Db, userId: string, matchId: string) {
  const match = getMatchRow(db, matchId);
  const me = match && participantsOf(db, matchId).find((p) => p.user_id === userId);
  if (!match || !me) throw notFound("that date");
  return { match, me, other: participantsOf(db, matchId).find((p) => p.user_id !== userId)! };
}

export function currentTerms(db: Db, match: MatchRow): Terms {
  const opp = getOpportunity(db, match.slot_id)!;
  return {
    experienceId: match.experience_id,
    slotId: match.slot_id,
    startsAt: opp.startsAt,
    totalPriceCents: match.total_price_cents,
    shareCents: match.share_cents,
    feeCents: match.fee_cents,
    cancellationDeadline: match.cancellation_deadline,
    lateRefundPct: match.late_refund_pct,
  };
}

export function confirmDetails(db: Db, userId: string, matchId: string, termsHash: string) {
  tx(db, () => {
    const { match } = requireParticipant(db, userId, matchId);
    if (match.status !== "awaiting_commitment") throw new AppError("not_awaiting", "This date is no longer waiting for confirmation.");
    if (match.commitment_expires_at <= nowIso()) throw new AppError("expired", "The time to commit to this date has passed.");
    if (termsHash !== match.terms_hash) throw new AppError("terms_changed", "The details changed since you loaded this page. Please review them again.");
    run(db, "UPDATE match_participants SET details_confirmed_hash = ?, details_confirmed_at = ? WHERE match_id = ? AND user_id = ?", termsHash, nowIso(), matchId, userId);
    audit(db, userId, "match.details_confirmed", "match", matchId, { termsHash });
  });
}

export function confirmAttendanceIntent(db: Db, userId: string, matchId: string) {
  const { match, other } = requireParticipant(db, userId, matchId);
  if (match.status !== "confirmed") throw new AppError("not_confirmed", "You can confirm once the date is confirmed.");
  run(db, "UPDATE match_participants SET attendance_confirmed_at = COALESCE(attendance_confirmed_at, ?) WHERE match_id = ? AND user_id = ?", nowIso(), matchId, userId);
  const me = getOwnProfile(db, userId);
  notify(db, other.user_id, { kind: "attendance_confirmed", title: `${me?.firstName} confirmed: see you there`, body: "Both of you get the same itinerary and reminders.", link: `/matches/${matchId}`, dedupeKey: `attending:${matchId}:${userId}` });
}

export function mutualYes(db: Db, matchId: string, a: string, b: string): boolean {
  const rows = all<{ user_id: string; open_to_another: number }>(db, "SELECT user_id, open_to_another FROM post_date_feedback WHERE match_id = ?", matchId);
  const match = getMatchRow(db, matchId);
  const ids = new Set(participantsOf(db, matchId).map((p) => p.user_id));
  return !!match && match.status === "completed" && ids.has(a) && ids.has(b) && rows.length === 2 && rows.every((r) => r.open_to_another === 1);
}

export type MatchView = Awaited<ReturnType<typeof getMatchView>>;

/** Everything one participant may see about their date. Venue name and address only once it's confirmed. */
export function getMatchView(db: Db, userId: string, matchId: string) {
  const { match, me, other } = requireParticipant(db, userId, matchId);
  const viewer = getOwnProfile(db, userId);
  const otherProfile = getOwnProfile(db, other.user_id)!;
  const opp = getOpportunity(db, match.slot_id, userId)!;
  const reveal = match.status === "confirmed" || match.status === "completed";
  const venue = reveal
    ? one<{ name: string; address: string; arrival_notes: string }>(
        db,
        "SELECT v.name, v.address, e.arrival_notes FROM date_experiences e JOIN venues v ON v.id = e.venue_id WHERE e.id = ?",
        match.experience_id,
      )
    : null;
  const reservation = one<{ status: string; confirmation_code: string | null; is_test: number }>(db, "SELECT status, confirmation_code, is_test FROM reservations WHERE match_id = ?", matchId);
  const myIntent = latestIntent(db, matchId, userId);
  const otherIntent = latestIntent(db, matchId, other.user_id);
  const committed = (p: ParticipantRow, i?: IntentRow) =>
    p.details_confirmed_hash === match.terms_hash && !!i && ["authorized", "captured", "refunded", "partially_refunded"].includes(i.status);
  const reschedule = one<{ id: string; requested_by: string; new_slot_id: string; status: string }>(
    db,
    "SELECT id, requested_by, new_slot_id, status FROM reschedule_requests WHERE match_id = ? AND status = 'pending'",
    matchId,
  );
  const myFeedback = one<{ open_to_another: number }>(db, "SELECT open_to_another FROM post_date_feedback WHERE match_id = ? AND user_id = ?", matchId, userId);
  const feedbackCount = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM post_date_feedback WHERE match_id = ?", matchId)!.n;
  const repeatInvite = one<{ id: string; status: string; from_user_id: string }>(
    db,
    "SELECT id, status, from_user_id FROM date_invitations WHERE previous_match_id = ? AND status IN ('pending', 'accepted') ORDER BY created_at DESC LIMIT 1",
    matchId,
  );
  return {
    id: match.id,
    status: match.status,
    isTest: !!match.is_test,
    termsHash: match.terms_hash,
    opportunity: opp,
    venue,
    reservation: reservation ? { status: reservation.status, confirmationCode: reveal ? reservation.confirmation_code : null, isTest: !!reservation.is_test } : null,
    price: { totalCents: match.total_price_cents, shareCents: match.share_cents, feeCents: match.fee_cents, dueCents: match.share_cents + match.fee_cents },
    cancellationDeadline: match.cancellation_deadline,
    commitmentExpiresAt: match.commitment_expires_at,
    confirmedAt: match.confirmed_at,
    cancelledAt: match.cancelled_at,
    cancelledByMe: match.cancelled_by === userId,
    cancelReason: match.cancel_reason,
    me: {
      role: me.role,
      detailsConfirmed: me.details_confirmed_hash === match.terms_hash,
      attendanceConfirmed: !!me.attendance_confirmed_at,
      committed: committed(me, myIntent),
      payment: myIntent
        ? { status: myIntent.status, failureReason: myIntent.failure_reason, amountCents: myIntent.amount_cents, refundedCents: myIntent.refunded_cents, isTest: !!myIntent.is_test }
        : null,
      dietaryOrAccessNotes: !!(viewer?.dietaryNotes || viewer?.accessibilityNotes),
    },
    other: {
      profile: toPublic(otherProfile, viewer),
      detailsConfirmed: other.details_confirmed_hash === match.terms_hash,
      committed: committed(other, otherIntent),
      attendanceConfirmed: !!other.attendance_confirmed_at,
    },
    reschedule: reschedule
      ? { id: reschedule.id, byMe: reschedule.requested_by === userId, newSlot: getOpportunity(db, reschedule.new_slot_id, userId) }
      : null,
    feedback: {
      submitted: !!myFeedback,
      bothSubmitted: feedbackCount === 2,
      mutualYes: mutualYes(db, matchId, userId, other.user_id),
    },
    repeatInvitation: repeatInvite ? { id: repeatInvite.id, status: repeatInvite.status, fromMe: repeatInvite.from_user_id === userId } : null,
  };
}

export type MatchSummary = {
  id: string;
  status: MatchRow["status"];
  title: string;
  category: Opportunity["category"];
  startsAt: string;
  otherName: string;
  otherUserId: string;
  needsMyCommitment: boolean;
  needsCheckIn: boolean;
};

export function listMatches(db: Db, userId: string): MatchSummary[] {
  const rows = all<MatchRow & { other_id: string }>(
    db,
    `SELECT m.*, o.user_id AS other_id FROM matches m
       JOIN match_participants me ON me.match_id = m.id AND me.user_id = ?
       JOIN match_participants o ON o.match_id = m.id AND o.user_id <> ?
      ORDER BY m.created_at DESC`,
    userId, userId,
  );
  return rows.map((m) => {
    const opp = getOpportunity(db, m.slot_id)!;
    const other = getOwnProfile(db, m.other_id);
    const me = participantsOf(db, m.id).find((p) => p.user_id === userId)!;
    const intent = latestIntent(db, m.id, userId);
    const feedback = one(db, "SELECT 1 FROM post_date_feedback WHERE match_id = ? AND user_id = ?", m.id, userId);
    return {
      id: m.id,
      status: m.status,
      title: opp.title,
      category: opp.category,
      startsAt: opp.startsAt,
      otherName: other?.firstName ?? "Your date",
      otherUserId: m.other_id,
      needsMyCommitment: m.status === "awaiting_commitment" && !(me.details_confirmed_hash === m.terms_hash && intent?.status === "authorized"),
      needsCheckIn: m.status === "completed" && !feedback,
    };
  });
}

// ---------------------------------------------------------------------------
// Rescheduling: structured, never silent. The other person must agree.
// ---------------------------------------------------------------------------

export function alternativeSlots(db: Db, userId: string, matchId: string) {
  const { match, other } = requireParticipant(db, userId, matchId);
  const slots = all<{ id: string }>(
    db,
    "SELECT id FROM availability_slots WHERE experience_id = ? AND id <> ? AND status = 'open' AND reserved_count < capacity AND starts_at > ? ORDER BY starts_at LIMIT 12",
    match.experience_id, match.slot_id, nowIso(),
  );
  return slots
    .map((s) => getOpportunity(db, s.id, userId)!)
    .filter((o) => isBookable(o.startsAt) && !busyAt(db, userId, o.startsAt, matchId) && !busyAt(db, other.user_id, o.startsAt, matchId));
}

export function requestReschedule(db: Db, userId: string, matchId: string, newSlotId: string) {
  return tx(db, () => {
    const { match, other } = requireParticipant(db, userId, matchId);
    if (match.status !== "confirmed") throw new AppError("not_confirmed", "Only confirmed dates can be moved.");
    const alt = alternativeSlots(db, userId, matchId).find((o) => o.slotId === newSlotId);
    if (!alt) throw new AppError("unavailable", "That time isn't available.");
    const reqId = id();
    try {
      run(db, "INSERT INTO reschedule_requests (id, match_id, requested_by, new_slot_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", reqId, matchId, userId, newSlotId, nowIso());
    } catch (e) {
      if (String(e).includes("UNIQUE")) throw new AppError("pending", "There's already a time change waiting for an answer.");
      throw e;
    }
    const me = getOwnProfile(db, userId);
    notify(db, other.user_id, {
      kind: "reschedule_requested",
      title: `${me?.firstName} asked to move your date`,
      body: `Proposed: ${formatDateTime(alt.startsAt)}. Nothing changes unless you agree.`,
      link: `/matches/${matchId}`,
    });
    audit(db, userId, "match.reschedule_requested", "match", matchId, { newSlotId });
    return reqId;
  });
}

export function withdrawReschedule(db: Db, userId: string, requestId: string) {
  const r = run(db, "UPDATE reschedule_requests SET status = 'withdrawn', responded_at = ? WHERE id = ? AND requested_by = ? AND status = 'pending'", nowIso(), requestId, userId);
  if (r.changes !== 1) throw new AppError("not_pending", "That request is no longer pending.");
}

export { cancellationDeadline };
