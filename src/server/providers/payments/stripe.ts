import crypto from "node:crypto";
import type { PaymentEvent, PaymentProvider } from "./types";

/**
 * Stripe test-mode integration path (Phase 2). Uses manual capture so each
 * person's share is only an authorization until both have committed.
 *
 * Not exercised in demo mode. For a real marketplace, add Stripe Connect
 * (destination charges / transfers to venue accounts) — see README.
 */
export function createStripePaymentProvider(secretKey: string, webhookSecret: string): PaymentProvider {
  const api = async (path: string, params: Record<string, string>, idempotencyKey: string) => {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotencyKey,
      },
      body: new URLSearchParams(params),
    });
    const json = (await res.json()) as { id?: string; error?: { message: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
    return json;
  };

  return {
    name: "stripe",
    isTest: secretKey.startsWith("sk_test_"),

    async createIntent({ amountCents, currency, idempotencyKey, metadata }) {
      const params: Record<string, string> = { amount: String(amountCents), currency, capture_method: "manual" };
      for (const [k, v] of Object.entries(metadata)) params[`metadata[${k}]`] = v;
      const pi = await api("payment_intents", params, idempotencyKey);
      return { providerRef: pi.id! };
    },
    async confirmIntent(ref, paymentMethod, idempotencyKey) {
      await api(`payment_intents/${ref}/confirm`, { payment_method: paymentMethod }, idempotencyKey);
    },
    async capture(ref, idempotencyKey) {
      await api(`payment_intents/${ref}/capture`, {}, idempotencyKey);
    },
    async cancel(ref, idempotencyKey) {
      await api(`payment_intents/${ref}/cancel`, {}, idempotencyKey);
    },
    async refund(ref, amountCents, idempotencyKey) {
      await api("refunds", { payment_intent: ref, amount: String(amountCents) }, idempotencyKey);
    },

    verifyWebhook(rawBody, signature) {
      // Stripe-Signature: t=timestamp,v1=hmac_sha256(`${t}.${body}`)
      const parts = Object.fromEntries((signature ?? "").split(",").map((p) => p.split("=") as [string, string]));
      const expected = crypto.createHmac("sha256", webhookSecret).update(`${parts.t}.${rawBody}`).digest("hex");
      const valid = parts.v1 && parts.v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
      if (!valid || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new Error("Invalid webhook signature");

      const evt = JSON.parse(rawBody) as { id: string; type: string; data: { object: Record<string, unknown> } };
      const obj = evt.data.object;
      const ref = (obj.payment_intent as string) ?? (obj.id as string);
      const map: Record<string, PaymentEvent["type"]> = {
        "payment_intent.amount_capturable_updated": "payment.authorized",
        "payment_intent.payment_failed": "payment.failed",
        "payment_intent.succeeded": "payment.captured",
        "payment_intent.canceled": "payment.voided",
        "charge.refunded": "payment.refunded",
      };
      const type = map[evt.type];
      if (!type) throw new Error(`Unhandled Stripe event ${evt.type}`);
      const lastError = obj.last_payment_error as { message?: string } | undefined;
      return {
        id: evt.id,
        type,
        providerRef: ref,
        amountCents: Number(type === "payment.refunded" ? obj.amount_refunded : obj.amount),
        failureReason: lastError?.message,
      };
    },
  };
}
