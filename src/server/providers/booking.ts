import crypto from "node:crypto";

export type BookingRequest = {
  reservationId: string;
  experienceId: string;
  startsAt: string;
  partySize: 2;
  /** Private needs, passed only to the venue. Never shown to the other participant. */
  venueNotes: string[];
  idempotencyKey: string;
};

export interface BookingProvider {
  readonly name: string;
  readonly isTest: boolean;
  secure(req: BookingRequest): Promise<{ providerRef: string; confirmationCode: string }>;
  cancel(providerRef: string): Promise<void>;
}

/**
 * Simulated venue inventory. ONCE has no live venue partnerships in demo mode;
 * real integrations (OpenTable, Resy, SevenRooms, direct venue APIs) implement
 * this interface in Phase 2.
 */
export function createMockBookingProvider(opts: { failFor?: (req: BookingRequest) => boolean } = {}): BookingProvider {
  const secured = new Map<string, { providerRef: string; confirmationCode: string }>();
  return {
    name: "mock-venue",
    isTest: true,
    async secure(req) {
      const existing = secured.get(req.idempotencyKey);
      if (existing) return existing;
      if (opts.failFor?.(req)) throw new Error("The venue could not hold this table.");
      const code = crypto.randomBytes(3).toString("hex").toUpperCase();
      const result = { providerRef: `bk_test_${crypto.randomUUID().slice(0, 12)}`, confirmationCode: `TEST-${code}` };
      secured.set(req.idempotencyKey, result);
      return result;
    },
    async cancel() {},
  };
}
