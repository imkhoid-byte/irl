import crypto from "node:crypto";
import { one, run, tx, type Db } from "../../db";
import { addHours, now, nowIso } from "@/lib/time";
import { POLICY } from "@/lib/policy";
import type { PaymentEvent, PaymentProvider } from "./types";

export function mockWebhookSecret(): string {
  return process.env.MOCK_WEBHOOK_SECRET ?? "dev-only-mock-webhook-secret";
}

export function signMockPayload(rawBody: string, secret = mockWebhookSecret()): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

type Deliver = (rawBody: string, signature: string) => Promise<void>;

type Charge = { ref: string; amount_cents: number; status: string; refunded_cents: number };

const DECLINES: Record<string, string> = {
  pm_card_chargeDeclined: "Your card was declined.",
  pm_card_chargeDeclinedInsufficientFunds: "Your card has insufficient funds.",
};

/**
 * A stand-in for a real payment processor. It keeps its own ledger and reports
 * every outcome through signed webhook events, exactly like a real provider —
 * ONCE never learns about a payment any other way. All money here is test data.
 */
export function createMockPaymentProvider(db: Db, deliver: Deliver): PaymentProvider {
  /** Returns false if this idempotency key was already used (the call is a replay). */
  const firstUse = (key: string) =>
    run(db, "INSERT OR IGNORE INTO mock_provider_requests (idempotency_key, created_at) VALUES (?, ?)", key, nowIso()).changes === 1;

  const charge = (ref: string) => {
    const c = one<Charge>(db, "SELECT ref, amount_cents, status, refunded_cents FROM mock_provider_charges WHERE ref = ?", ref);
    if (!c) throw new Error(`mock provider: unknown payment ${ref}`);
    return c;
  };

  const emit = async (event: Omit<PaymentEvent, "id">) => {
    const body = JSON.stringify({ ...event, id: `evt_test_${crypto.randomUUID()}` });
    await deliver(body, signMockPayload(body));
  };

  return {
    name: "mock",
    isTest: true,

    async createIntent({ amountCents, idempotencyKey, metadata }) {
      const existing = one<{ ref: string }>(db, "SELECT ref FROM mock_provider_charges WHERE idempotency_key = ?", idempotencyKey);
      if (existing) return { providerRef: existing.ref };
      const ref = `pi_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      run(db, "INSERT INTO mock_provider_charges (ref, amount_cents, status, idempotency_key, metadata, created_at) VALUES (?, ?, 'requires_confirmation', ?, ?, ?)", ref, amountCents, idempotencyKey, JSON.stringify(metadata), nowIso());
      return { providerRef: ref };
    },

    async confirmIntent(ref, paymentMethod, idempotencyKey) {
      if (!firstUse(idempotencyKey)) return;
      const c = charge(ref);
      if (c.status !== "requires_confirmation") return;
      const decline = DECLINES[paymentMethod] ?? (paymentMethod === "pm_card_visa" ? null : "Unsupported test payment method.");
      run(db, "UPDATE mock_provider_charges SET status = ? WHERE ref = ?", decline ? "failed" : "authorized", ref);
      if (decline) await emit({ type: "payment.failed", providerRef: ref, amountCents: c.amount_cents, failureReason: decline });
      else await emit({ type: "payment.authorized", providerRef: ref, amountCents: c.amount_cents, authorizationExpiresAt: addHours(now(), POLICY.mockAuthorizationDays * 24).toISOString() });
    },

    async capture(ref, idempotencyKey) {
      if (!firstUse(idempotencyKey)) return;
      const c = charge(ref);
      if (c.status !== "authorized") throw new Error(`mock provider: cannot capture a ${c.status} payment`);
      run(db, "UPDATE mock_provider_charges SET status = 'captured' WHERE ref = ?", ref);
      await emit({ type: "payment.captured", providerRef: ref, amountCents: c.amount_cents });
    },

    async cancel(ref, idempotencyKey) {
      if (!firstUse(idempotencyKey)) return;
      const c = charge(ref);
      if (c.status !== "authorized" && c.status !== "requires_confirmation") return;
      run(db, "UPDATE mock_provider_charges SET status = 'canceled' WHERE ref = ?", ref);
      await emit({ type: "payment.voided", providerRef: ref, amountCents: c.amount_cents });
    },

    async refund(ref, amountCents, idempotencyKey) {
      if (!firstUse(idempotencyKey)) return;
      const total = tx(db, () => {
        const c = charge(ref);
        if (c.status !== "captured" || amountCents <= 0 || c.refunded_cents + amountCents > c.amount_cents) return null;
        run(db, "UPDATE mock_provider_charges SET refunded_cents = refunded_cents + ? WHERE ref = ?", amountCents, ref);
        return c.refunded_cents + amountCents;
      });
      if (total === null) throw new Error("mock provider: refund exceeds captured amount");
      await emit({ type: "payment.refunded", providerRef: ref, amountCents: total });
    },

    verifyWebhook(rawBody, signature) {
      const expected = signMockPayload(rawBody);
      if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        throw new Error("Invalid webhook signature");
      }
      return JSON.parse(rawBody) as PaymentEvent;
    },
  };
}
