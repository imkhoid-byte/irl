/** Normalized payment events. Only verified provider events may change payment state. */
export type PaymentEventType =
  | "payment.authorized"
  | "payment.failed"
  | "payment.captured"
  | "payment.voided"
  | "payment.refunded";

export type PaymentEvent = {
  id: string;
  type: PaymentEventType;
  providerRef: string;
  /** For payment.refunded this is the cumulative amount refunded so far (as Stripe reports it). */
  amountCents: number;
  failureReason?: string;
  authorizationExpiresAt?: string;
};

/**
 * Test payment methods. ONCE never sees card numbers: in production the card is
 * collected by the provider's hosted field (e.g. Stripe Elements) and only a
 * token reaches the server.
 */
export const TEST_PAYMENT_METHODS = {
  pm_card_visa: { label: "Visa ending 4242", outcome: "Succeeds" },
  pm_card_chargeDeclined: { label: "Visa ending 0002", outcome: "Declined" },
  pm_card_chargeDeclinedInsufficientFunds: { label: "Visa ending 9995", outcome: "Insufficient funds" },
} as const;
export type TestPaymentMethod = keyof typeof TEST_PAYMENT_METHODS;

export interface PaymentProvider {
  readonly name: "mock" | "stripe";
  /** True for anything that does not move real money. Shown in the UI. */
  readonly isTest: boolean;
  /** Create a manual-capture intent (an authorization hold, not a charge). */
  createIntent(input: { amountCents: number; currency: string; idempotencyKey: string; metadata: Record<string, string> }): Promise<{ providerRef: string }>;
  /** Attach a payment method and request authorization. The outcome arrives as a webhook event. */
  confirmIntent(providerRef: string, paymentMethod: string, idempotencyKey: string): Promise<void>;
  capture(providerRef: string, idempotencyKey: string): Promise<void>;
  /** Release an uncaptured authorization. */
  cancel(providerRef: string, idempotencyKey: string): Promise<void>;
  refund(providerRef: string, amountCents: number, idempotencyKey: string): Promise<void>;
  /** Verify the signature of a raw webhook body and return the normalized event. Throws if invalid. */
  verifyWebhook(rawBody: string, signature: string | null): PaymentEvent;
}
