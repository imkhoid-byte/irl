import { getCtx } from "@/server/session";
import { receivePaymentWebhook } from "@/server/services/payments";

/**
 * Payment provider webhooks. The ONLY way a payment's status changes.
 * Signature verified by the provider adapter (mock: HMAC; Stripe: Stripe-Signature).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-mock-signature") ?? req.headers.get("stripe-signature");
  try {
    await receivePaymentWebhook(getCtx(), raw, signature);
  } catch (e) {
    console.warn("rejected webhook", (e as Error).message);
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  return Response.json({ received: true });
}
