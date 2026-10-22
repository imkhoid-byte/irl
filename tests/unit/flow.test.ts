import { afterEach, describe, expect, it } from "vitest";
import { all, one, run } from "@/server/db";
import { setNowForTests } from "@/lib/time";
import { setup, slotFor, key, T0 } from "./helpers";
import { confirmDetails, getMatchView, respondToInvitation, sendInvitation, getMatchRow } from "@/server/services/dates";
import { commitPayment, receivePaymentWebhook } from "@/server/services/payments";
import { cancelMatch, sweep } from "@/server/services/lifecycle";
import { signMockPayload } from "@/server/providers/payments/mock";
import type { Ctx } from "@/server/context";

afterEach(() => setNowForTests(null));

async function invitedAndAccepted(ctx: Ctx & { users: Record<string, string> }, slug = "coffee-and-a-bookstore") {
  const slotId = slotFor(ctx.db, slug);
  const inv = sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ben });
  const { matchId } = respondToInvitation(ctx.db, ctx.users.ben, inv, true);
  return { slotId, matchId: matchId! };
}

async function commit(ctx: Ctx, userId: string, matchId: string, paymentMethod = "pm_card_visa") {
  const m = getMatchRow(ctx.db, matchId)!;
  confirmDetails(ctx.db, userId, matchId, m.terms_hash);
  return commitPayment(ctx, userId, matchId, { paymentMethod, idempotencyKey: key() });
}

const intents = (ctx: Ctx, matchId: string) => all<{ user_id: string; status: string; amount_cents: number; refunded_cents: number }>(ctx.db, "SELECT user_id, status, amount_cents, refunded_cents FROM payment_intents WHERE match_id = ? ORDER BY created_at", matchId);

describe("the core commitment flow", () => {
  it("confirms a date only after both people commit and the venue is secured", async () => {
    const ctx = setup();
    const { matchId, slotId } = await invitedAndAccepted(ctx);
    expect(getMatchRow(ctx.db, matchId)!.status).toBe("awaiting_commitment");
    expect(one<{ reserved_count: number }>(ctx.db, "SELECT reserved_count FROM availability_slots WHERE id = ?", slotId)!.reserved_count).toBe(1);

    const a = await commit(ctx, ctx.users.ava, matchId);
    expect(a.status).toBe("authorized");
    expect(a.amount_cents).toBe(1200 + 300); // half of $24 plus the service fee
    expect(getMatchRow(ctx.db, matchId)!.status).toBe("awaiting_commitment");

    // Ben's card is declined: the date must not confirm, and Ava is not charged.
    const declined = await commit(ctx, ctx.users.ben, matchId, "pm_card_chargeDeclined");
    expect(declined.status).toBe("failed");
    expect(getMatchRow(ctx.db, matchId)!.status).toBe("awaiting_commitment");
    expect(intents(ctx, matchId).find((i) => i.user_id === ctx.users.ava)!.status).toBe("authorized");

    const b = await commitPayment(ctx, ctx.users.ben, matchId, { paymentMethod: "pm_card_visa", idempotencyKey: key() });
    expect(b.status).toBe("captured");
    const match = getMatchRow(ctx.db, matchId)!;
    expect(match.status).toBe("confirmed");
    expect(intents(ctx, matchId).filter((i) => i.status === "captured")).toHaveLength(2);
    expect(one<{ status: string; confirmation_code: string }>(ctx.db, "SELECT status, confirmation_code FROM reservations WHERE match_id = ?", matchId)).toMatchObject({ status: "secured" });

    // Both see the same itinerary; the venue address is revealed now.
    const va = getMatchView(ctx.db, ctx.users.ava, matchId);
    const vb = getMatchView(ctx.db, ctx.users.ben, matchId);
    expect(va.venue?.address).toBeTruthy();
    expect(va.venue).toEqual(vb.venue);
    expect(va.opportunity.startsAt).toBe(vb.opportunity.startsAt);
    expect(va.reservation?.confirmationCode).toBe(vb.reservation?.confirmationCode);
  });

  it("hides the venue name and address until the date is confirmed", async () => {
    const ctx = setup();
    const { matchId } = await invitedAndAccepted(ctx);
    expect(getMatchView(ctx.db, ctx.users.ben, matchId).venue).toBeNull();
  });

  it("requires explicit agreement to the exact terms before payment", async () => {
    const ctx = setup();
    const { matchId } = await invitedAndAccepted(ctx);
    await expect(commitPayment(ctx, ctx.users.ava, matchId, { paymentMethod: "pm_card_visa", idempotencyKey: key() })).rejects.toThrow(/confirm the date details/);
    expect(() => confirmDetails(ctx.db, ctx.users.ava, matchId, "stale-hash")).toThrow(/details changed/);
  });

  it("never charges twice: replays and retries reuse the live payment", async () => {
    const ctx = setup();
    const { matchId } = await invitedAndAccepted(ctx);
    const m = getMatchRow(ctx.db, matchId)!;
    confirmDetails(ctx.db, ctx.users.ava, matchId, m.terms_hash);
    const k = key();
    const first = await commitPayment(ctx, ctx.users.ava, matchId, { paymentMethod: "pm_card_visa", idempotencyKey: k });
    const replay = await commitPayment(ctx, ctx.users.ava, matchId, { paymentMethod: "pm_card_visa", idempotencyKey: k });
    const retry = await commitPayment(ctx, ctx.users.ava, matchId, { paymentMethod: "pm_card_visa", idempotencyKey: key() });
    expect(replay.id).toBe(first.id);
    expect(retry.id).toBe(first.id);
    expect(intents(ctx, matchId)).toHaveLength(1);
    const ledger = all(ctx.db, "SELECT * FROM payment_transactions WHERE payment_intent_id = ? AND kind = 'authorization'", first.id);
    expect(ledger).toHaveLength(1);
  });

  it("unwinds completely if the venue can't secure the booking", async () => {
    const ctx = setup({ bookingFailFor: () => true });
    const { matchId, slotId } = await invitedAndAccepted(ctx);
    await commit(ctx, ctx.users.ava, matchId);
    await commit(ctx, ctx.users.ben, matchId);
    expect(getMatchRow(ctx.db, matchId)!.status).toBe("cancelled");
    expect(intents(ctx, matchId).every((i) => i.status === "canceled")).toBe(true);
    expect(one<{ reserved_count: number }>(ctx.db, "SELECT reserved_count FROM availability_slots WHERE id = ?", slotId)!.reserved_count).toBe(0);
  });
});

describe("payment webhooks", () => {
  it("rejects events with a bad signature", async () => {
    const ctx = setup();
    const body = JSON.stringify({ id: "evt_forged", type: "payment.authorized", providerRef: "pi_x", amountCents: 1 });
    await expect(receivePaymentWebhook(ctx, body, "deadbeef")).rejects.toThrow(/signature/);
    await expect(receivePaymentWebhook(ctx, body, null)).rejects.toThrow(/signature/);
  });

  it("processes each verified event once, even if delivered twice", async () => {
    const ctx = setup();
    const { matchId } = await invitedAndAccepted(ctx);
    const m = getMatchRow(ctx.db, matchId)!;
    confirmDetails(ctx.db, ctx.users.ava, matchId, m.terms_hash);
    // Create an intent but intercept confirmation so we can deliver the event ourselves.
    run(ctx.db, "INSERT INTO payment_intents (id, match_id, user_id, provider, provider_ref, amount_cents, share_cents, fee_cents, status, idempotency_key, created_at, updated_at) VALUES ('pi1', ?, ?, 'mock', 'pi_test_manual', 1500, 1200, 300, 'processing', 'k-manual', '', '')", matchId, ctx.users.ava);
    const body = JSON.stringify({ id: "evt_dup", type: "payment.authorized", providerRef: "pi_test_manual", amountCents: 1500 });
    await receivePaymentWebhook(ctx, body, signMockPayload(body));
    await receivePaymentWebhook(ctx, body, signMockPayload(body));
    expect(one<{ status: string }>(ctx.db, "SELECT status FROM payment_intents WHERE id = 'pi1'")!.status).toBe("authorized");
    expect(all(ctx.db, "SELECT * FROM payment_transactions WHERE payment_intent_id = 'pi1'")).toHaveLength(1);
  });
});

describe("concurrency and inventory", () => {
  it("an invitation can only be accepted once", async () => {
    const ctx = setup();
    const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
    const inv = sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ben });
    respondToInvitation(ctx.db, ctx.users.ben, inv, true);
    expect(() => respondToInvitation(ctx.db, ctx.users.ben, inv, true)).toThrow(/already been answered/);
    expect(all(ctx.db, "SELECT * FROM matches WHERE invitation_id = ?", inv)).toHaveLength(1);
  });

  it("a slot can't be oversold", async () => {
    const ctx = setup();
    const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
    run(ctx.db, "UPDATE availability_slots SET capacity = 1 WHERE id = ?", slotId);
    const inv1 = sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ben });
    const inv2 = sendInvitation(ctx.db, ctx.users.elena, { slotId, toUserId: ctx.users.jordan });
    respondToInvitation(ctx.db, ctx.users.ben, inv1, true);
    expect(() => respondToInvitation(ctx.db, ctx.users.jordan, inv2, true)).toThrow(/filled up/);
    expect(one<{ reserved_count: number }>(ctx.db, "SELECT reserved_count FROM availability_slots WHERE id = ?", slotId)!.reserved_count).toBe(1);
  });

  it("nobody can be double-booked at the same time", async () => {
    const ctx = setup();
    const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
    const inv = sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ben });
    respondToInvitation(ctx.db, ctx.users.ben, inv, true);
    expect(() => sendInvitation(ctx.db, ctx.users.chloe, { slotId, toUserId: ctx.users.ben })).toThrow(/isn't available/);
  });
});

describe("cancellation and refunds", () => {
  async function confirmed(ctx: ReturnType<typeof setup>) {
    const r = await invitedAndAccepted(ctx);
    await commit(ctx, ctx.users.ava, r.matchId);
    await commit(ctx, ctx.users.ben, r.matchId);
    return r.matchId;
  }

  it("refunds both people in full before the deadline", async () => {
    const ctx = setup();
    const matchId = await confirmed(ctx);
    await cancelMatch(ctx, ctx.users.ava, matchId);
    expect(getMatchRow(ctx.db, matchId)!.status).toBe("cancelled");
    for (const i of intents(ctx, matchId)) expect(i).toMatchObject({ status: "refunded", refunded_cents: i.amount_cents });
  });

  it("applies the late-cancellation policy after the deadline", async () => {
    const ctx = setup();
    const matchId = await confirmed(ctx);
    const m = getMatchRow(ctx.db, matchId)!;
    setNowForTests(new Date(new Date(m.cancellation_deadline).getTime() + 3600_000));
    await cancelMatch(ctx, ctx.users.ben, matchId);
    const byUser = Object.fromEntries(intents(ctx, matchId).map((i) => [i.user_id, i]));
    expect(byUser[ctx.users.ben]).toMatchObject({ status: "partially_refunded", refunded_cents: 600 }); // 50% of the $12 share
    expect(byUser[ctx.users.ava]).toMatchObject({ status: "refunded", refunded_cents: 1500 });
  });

  it("releases holds without charging when a date hasn't been confirmed", async () => {
    const ctx = setup();
    const { matchId } = await invitedAndAccepted(ctx);
    await commit(ctx, ctx.users.ava, matchId);
    await cancelMatch(ctx, ctx.users.ben, matchId);
    expect(intents(ctx, matchId)[0].status).toBe("canceled");
    expect(all(ctx.db, "SELECT * FROM payment_transactions pt JOIN payment_intents pi ON pi.id = pt.payment_intent_id WHERE pi.match_id = ? AND pt.kind = 'capture'", matchId)).toHaveLength(0);
  });

  it("expires uncommitted matches and releases the authorization and inventory", async () => {
    const ctx = setup();
    const { matchId, slotId } = await invitedAndAccepted(ctx);
    await commit(ctx, ctx.users.ava, matchId);
    setNowForTests(new Date(T0.getTime() + 25 * 3600_000));
    await sweep(ctx);
    expect(getMatchRow(ctx.db, matchId)!.status).toBe("expired");
    expect(intents(ctx, matchId)[0].status).toBe("canceled");
    expect(one<{ reserved_count: number }>(ctx.db, "SELECT reserved_count FROM availability_slots WHERE id = ?", slotId)!.reserved_count).toBe(0);
  });
});
