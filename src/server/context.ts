import type { Db } from "./db";
import type { PaymentProvider } from "./providers/payments/types";
import { createMockPaymentProvider } from "./providers/payments/mock";
import { createStripePaymentProvider } from "./providers/payments/stripe";
import { createMockBookingProvider, type BookingProvider, type BookingRequest } from "./providers/booking";
import { mockIdentityProvider, type IdentityProvider } from "./providers/identity";
import { receivePaymentWebhook } from "./services/payments";

/** Everything a service needs: the database and the external providers behind interfaces. */
export type Ctx = {
  db: Db;
  payments: PaymentProvider;
  booking: BookingProvider;
  identity: IdentityProvider;
};

export function createCtx(db: Db, opts: { bookingFailFor?: (req: BookingRequest) => boolean } = {}): Ctx {
  const ctx = { db, booking: createMockBookingProvider({ failFor: opts.bookingFailFor }), identity: mockIdentityProvider } as Ctx;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (process.env.PAYMENT_PROVIDER === "stripe" && stripeKey && process.env.STRIPE_WEBHOOK_SECRET) {
    ctx.payments = createStripePaymentProvider(stripeKey, process.env.STRIPE_WEBHOOK_SECRET);
  } else {
    // The mock provider "delivers" its signed webhooks straight to the same handler
    // that POST /api/webhooks/payments uses.
    ctx.payments = createMockPaymentProvider(db, (raw, sig) => receivePaymentWebhook(ctx, raw, sig));
  }
  return ctx;
}

export function isDemoMode(): boolean {
  return process.env.PAYMENT_PROVIDER !== "stripe";
}
