import { all, id, one, run, tx } from "../db";
import type { Ctx } from "../context";
import { nowIso } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { AppError } from "../errors";
import type { PaymentEvent } from "../providers/payments/types";
import { audit } from "./audit";
import { notify, notifyBoth } from "./notifications";
import { getMatchRow, latestIntent, participantsOf, requireParticipant, type IntentRow } from "./dates";
import { getOpportunity } from "./discovery";
import { getOwnProfile } from "./profiles";
import { formatDateTime } from "@/lib/time";

const LIVE = ["processing", "authorized", "captured", "refunded", "partially_refunded"] as const;

/**
 * Commit one participant's share. Creates (or reuses, by idempotency key) a
 * manual-capture payment intent and asks the provider to authorize it. The
 * result is learned ONLY from the provider's signed webhook — never from the
 * browser.
 */
export async function commitPayment(ctx: Ctx, userId: string, matchId: string, input: { paymentMethod: string; idempotencyKey: string }) {
  const { db } = ctx;
  if (!/^[\w:-]{8,100}$/.test(input.idempotencyKey)) throw new AppError("invalid", "Please reload the page and try again.");

  const intent = tx(db, () => {
    const replay = one<IntentRow>(db, "SELECT * FROM payment_intents WHERE idempotency_key = ?", input.idempotencyKey);
    if (replay) {
      if (replay.user_id !== userId || replay.match_id !== matchId) throw new AppError("invalid", "Please reload the page and try again.");
      return { row: replay, isNew: false };
    }
    const { match, me } = requireParticipant(db, userId, matchId);
    if (match.status !== "awaiting_commitment") throw new AppError("not_awaiting", "This date isn't waiting for payment.");
    if (match.commitment_expires_at <= nowIso()) throw new AppError("expired", "The time to commit to this date has passed. Nothing was charged.");
    if (me.details_confirmed_hash !== match.terms_hash) throw new AppError("confirm_first", "Please confirm the date details first.");
    const live = one<IntentRow>(db, `SELECT * FROM payment_intents WHERE match_id = ? AND user_id = ? AND status IN (${LIVE.map(() => "?").join(",")})`, matchId, userId, ...LIVE);
    if (live) return { row: live, isNew: false };

    const t = nowIso();
    const intentId = id();
    run(
      db,
      `INSERT INTO payment_intents (id, match_id, user_id, provider, amount_cents, share_cents, fee_cents, status, idempotency_key, is_test, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?)`,
      intentId, matchId, userId, ctx.payments.name, match.share_cents + match.fee_cents, match.share_cents, match.fee_cents, input.idempotencyKey, ctx.payments.isTest ? 1 : 0, t, t,
    );
    audit(db, userId, "payment.intent_created", "payment_intent", intentId, { matchId, amountCents: match.share_cents + match.fee_cents, test: ctx.payments.isTest });
    return { row: one<IntentRow>(db, "SELECT * FROM payment_intents WHERE id = ?", intentId)!, isNew: true };
  });

  if (intent.isNew) {
    try {
      const { providerRef } = await ctx.payments.createIntent({
        amountCents: intent.row.amount_cents,
        currency: "usd",
        idempotencyKey: `create:${intent.row.id}`,
        metadata: { matchId, userId, paymentIntentId: intent.row.id },
      });
      run(db, "UPDATE payment_intents SET provider_ref = ?, updated_at = ? WHERE id = ?", providerRef, nowIso(), intent.row.id);
      await ctx.payments.confirmIntent(providerRef, input.paymentMethod, `confirm:${intent.row.id}`);
    } catch (e) {
      console.error("payment provider error", e);
      run(db, "UPDATE payment_intents SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ? AND status = 'processing'", "The payment provider couldn't be reached.", nowIso(), intent.row.id);
    }
  }
  await tryFinalizeMatch(ctx, matchId);
  return one<IntentRow>(db, "SELECT * FROM payment_intents WHERE id = ?", intent.row.id)!;
}

/** Entry point for POST /api/webhooks/payments (and the mock provider's in-process delivery). */
export async function receivePaymentWebhook(ctx: Ctx, rawBody: string, signature: string | null) {
  const event = ctx.payments.verifyWebhook(rawBody, signature);
  await handlePaymentEvent(ctx, event);
}

export async function handlePaymentEvent(ctx: Ctx, event: PaymentEvent) {
  const { db } = ctx;
  const outcome = tx(db, () => {
    const t = nowIso();
    run(db, "INSERT OR IGNORE INTO provider_events (id, provider, type, payload, received_at) VALUES (?, ?, ?, ?, ?)", event.id, ctx.payments.name, event.type, JSON.stringify(event), t);
    const seen = one<{ processed_at: string | null }>(db, "SELECT processed_at FROM provider_events WHERE id = ?", event.id);
    if (seen?.processed_at) return null; // duplicate delivery

    const intent = one<IntentRow>(db, "SELECT * FROM payment_intents WHERE provider_ref = ?", event.providerRef);
    run(db, "UPDATE provider_events SET processed_at = ? WHERE id = ?", t, event.id);
    if (!intent) return null;

    const ledger = (kind: string, amount: number) =>
      run(db, "INSERT INTO payment_transactions (id, payment_intent_id, kind, amount_cents, provider_event_id, is_test, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id(), intent.id, kind, amount, event.id, intent.is_test, t);
    const set = (status: string, extra = "", ...params: (string | number | null)[]) =>
      run(db, `UPDATE payment_intents SET status = ?, updated_at = ?${extra} WHERE id = ?`, status, t, ...params, intent.id);

    switch (event.type) {
      case "payment.authorized":
        if (intent.status !== "processing") return null;
        set("authorized", ", authorization_expires_at = ?", event.authorizationExpiresAt ?? null);
        ledger("authorization", event.amountCents);
        return { kind: "authorized" as const, intent };
      case "payment.failed":
        if (intent.status !== "processing") return null;
        set("failed", ", failure_reason = ?", event.failureReason ?? "The payment was declined.");
        ledger("failure", 0);
        return { kind: "failed" as const, intent, reason: event.failureReason };
      case "payment.captured":
        if (intent.status !== "authorized") return null;
        set("captured");
        ledger("capture", event.amountCents);
        return null;
      case "payment.voided":
        if (intent.status !== "authorized" && intent.status !== "processing") return null;
        set("canceled");
        ledger("void", 0);
        return null;
      case "payment.refunded": {
        // Provider reports the cumulative refund; the ledger records the increment.
        const delta = event.amountCents - intent.refunded_cents;
        if (delta <= 0) return null;
        const status = event.amountCents >= intent.amount_cents ? "refunded" : "partially_refunded";
        set(status, ", refunded_cents = ?", event.amountCents);
        ledger("refund", delta);
        return { kind: "refunded" as const, intent, delta };
      }
    }
  });
  if (!outcome) return;

  const match = getMatchRow(db, outcome.intent.match_id);
  if (outcome.kind === "authorized") {
    if (match?.status !== "awaiting_commitment") {
      // The date fell through while this was in flight: release the hold immediately.
      await ctx.payments.cancel(outcome.intent.provider_ref!, `void:stale:${outcome.intent.id}`);
      return;
    }
    await tryFinalizeMatch(ctx, outcome.intent.match_id);
  } else if (outcome.kind === "failed") {
    notify(db, outcome.intent.user_id, {
      kind: "payment_failed",
      title: "Your payment didn't go through",
      body: `${outcome.reason ?? "It was declined."} Nothing was charged. You can try another card before the commitment window closes.`,
      link: `/matches/${outcome.intent.match_id}/commit`,
    });
  } else if (outcome.kind === "refunded") {
    notify(db, outcome.intent.user_id, {
      kind: "refund_issued",
      title: `${formatMoney(outcome.delta)} refunded`,
      body: "It may take 5–10 business days to appear, depending on your bank. (Demo: test money only.)",
      link: `/matches/${outcome.intent.match_id}`,
      dedupeKey: `refund:${outcome.intent.id}:${outcome.delta}:${outcome.intent.refunded_cents}`,
    });
  }
}

/**
 * Confirm the date once — and only once — both shares are authorized and the
 * venue hold is secured. Then capture both. Any failure unwinds completely:
 * captured money is refunded, holds are released, and nobody is left paying alone.
 */
export async function tryFinalizeMatch(ctx: Ctx, matchId: string) {
  const { db } = ctx;
  const claim = tx(db, () => {
    const match = getMatchRow(db, matchId);
    if (!match || match.status !== "awaiting_commitment" || match.finalizing_at) return null;
    const parts = participantsOf(db, matchId);
    if (parts.length !== 2) return null;
    const intents = parts.map((p) => latestIntent(db, matchId, p.user_id));
    const t = nowIso();
    const ready = parts.every((p, i) => p.details_confirmed_hash === match.terms_hash && intents[i]?.status === "authorized" && (!intents[i]!.authorization_expires_at || intents[i]!.authorization_expires_at! > t));
    const reservation = one<{ id: string; status: string }>(db, "SELECT id, status FROM reservations WHERE match_id = ?", matchId);
    if (!ready || reservation?.status !== "held") return null;
    const claimed = run(db, "UPDATE matches SET finalizing_at = ? WHERE id = ? AND status = 'awaiting_commitment' AND finalizing_at IS NULL", t, matchId);
    if (claimed.changes !== 1) return null;
    return { match, parts, intents: intents as IntentRow[], reservationId: reservation.id };
  });
  if (!claim) return;

  const opp = getOpportunity(db, claim.match.slot_id)!;
  let booking: { providerRef: string; confirmationCode: string } | null = null;
  try {
    const notes = claim.parts
      .map((p) => getOwnProfile(db, p.user_id))
      .flatMap((p) => [p?.dietaryNotes, p?.accessibilityNotes])
      .filter((n): n is string => !!n);
    booking = await ctx.booking.secure({ reservationId: claim.reservationId, experienceId: claim.match.experience_id, startsAt: opp.startsAt, partySize: 2, venueNotes: notes, idempotencyKey: `secure:${claim.reservationId}` });
    for (const intent of claim.intents) await ctx.payments.capture(intent.provider_ref!, `capture:${intent.id}`);
    // Both authorizations were proven by verified webhooks before we got here. A
    // capture's own confirmation may arrive asynchronously (real providers), but
    // if the provider has already told us it failed, stop.
    const broken = claim.intents.some((i) => ["failed", "canceled"].includes(one<{ status: string }>(db, "SELECT status FROM payment_intents WHERE id = ?", i.id)?.status ?? ""));
    if (broken) throw new Error("capture rejected by provider");
  } catch (e) {
    console.error("finalize failed", matchId, e);
    await unwindFailedMatch(ctx, claim.match.id, claim.intents, booking?.providerRef ?? null);
    return;
  }

  tx(db, () => {
    const t = nowIso();
    run(db, "UPDATE reservations SET status = 'secured', provider = ?, provider_ref = ?, confirmation_code = ?, is_test = ?, updated_at = ? WHERE id = ?", ctx.booking.name, booking!.providerRef, booking!.confirmationCode, ctx.booking.isTest ? 1 : 0, t, claim.reservationId);
    run(db, "UPDATE matches SET status = 'confirmed', confirmed_at = ?, finalizing_at = NULL, updated_at = ? WHERE id = ?", t, t, matchId);
    notifyBoth(db, claim.parts.map((p) => p.user_id), {
      kind: "date_confirmed",
      title: "It's a date",
      body: `${opp.title} · ${formatDateTime(opp.startsAt)}. Your itinerary, venue and address are ready.`,
      link: `/matches/${matchId}`,
      dedupeKey: `confirmed:${matchId}`,
    });
    audit(db, null, "match.confirmed", "match", matchId, { reservationCode: booking!.confirmationCode });
  });
}

async function unwindFailedMatch(ctx: Ctx, matchId: string, intents: IntentRow[], bookingRef: string | null) {
  const { db } = ctx;
  for (const i of intents) {
    const status = one<{ status: string }>(db, "SELECT status FROM payment_intents WHERE id = ?", i.id)?.status;
    try {
      if (status === "captured") await ctx.payments.refund(i.provider_ref!, i.amount_cents, `refund:unwind:${i.id}`);
      else if (status === "authorized") await ctx.payments.cancel(i.provider_ref!, `void:unwind:${i.id}`);
    } catch (e) {
      console.error("unwind payment failed — needs manual review", i.id, e);
      audit(db, null, "payment.unwind_failed", "payment_intent", i.id);
    }
  }
  if (bookingRef) await ctx.booking.cancel(bookingRef).catch(() => {});
  tx(db, () => {
    const t = nowIso();
    const m = getMatchRow(db, matchId)!;
    run(db, "UPDATE matches SET status = 'cancelled', cancel_reason = 'could_not_confirm', cancelled_at = ?, finalizing_at = NULL, updated_at = ? WHERE id = ?", t, t, matchId);
    releaseInventory(ctx, matchId, m.slot_id, "released");
    notifyBoth(db, participantsOf(db, matchId).map((p) => p.user_id), {
      kind: "date_cancelled",
      title: "We couldn't confirm your date",
      body: "The venue couldn't hold the booking. Any payment has been released or refunded in full.",
      link: `/matches/${matchId}`,
      dedupeKey: `unwind:${matchId}`,
    });
    audit(db, null, "match.unwound", "match", matchId);
  });
}

/** Return a held/secured slot to inventory exactly once. Call inside a transaction. */
export function releaseInventory(ctx: Ctx, matchId: string, slotId: string, status: "released" | "cancelled") {
  const r = run(ctx.db, "UPDATE reservations SET status = ?, updated_at = ? WHERE match_id = ? AND status IN ('held', 'secured')", status, nowIso(), matchId);
  if (r.changes === 1) run(ctx.db, "UPDATE availability_slots SET reserved_count = MAX(reserved_count - 1, 0), updated_at = ? WHERE id = ?", nowIso(), slotId);
}

/** Release every uncaptured authorization on a match that won't go ahead. */
export async function voidAuthorizations(ctx: Ctx, matchId: string) {
  const intents = all<IntentRow>(ctx.db, "SELECT * FROM payment_intents WHERE match_id = ? AND status IN ('authorized', 'processing') AND provider_ref IS NOT NULL", matchId);
  for (const i of intents) await ctx.payments.cancel(i.provider_ref!, `void:${matchId}:${i.id}`);
}

export async function refundIntent(ctx: Ctx, intentId: string, amountCents: number, reasonKey: string) {
  const intent = one<IntentRow>(ctx.db, "SELECT * FROM payment_intents WHERE id = ?", intentId);
  if (!intent || !intent.provider_ref) throw new AppError("not_found", "Payment not found.");
  if (!["captured", "partially_refunded"].includes(intent.status)) throw new AppError("not_refundable", "Only captured payments can be refunded.");
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > intent.amount_cents - intent.refunded_cents) throw new AppError("invalid", "Refund amount exceeds what's left to refund.");
  await ctx.payments.refund(intent.provider_ref, amountCents, `refund:${reasonKey}:${intent.id}`);
}

export function paymentHistory(ctx: Ctx, userId: string) {
  return all<IntentRow & { title: string }>(
    ctx.db,
    `SELECT pi.*, e.title FROM payment_intents pi JOIN matches m ON m.id = pi.match_id JOIN date_experiences e ON e.id = m.experience_id
      WHERE pi.user_id = ? ORDER BY pi.created_at DESC`,
    userId,
  );
}
