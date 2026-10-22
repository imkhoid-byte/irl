import crypto from "node:crypto";

export interface IdentityProvider {
  readonly name: string;
  readonly isTest: boolean;
  /** Start a verification session. Real providers (Stripe Identity, Persona, Onfido) redirect the user to a hosted flow. */
  start(userId: string): Promise<{ ref: string; status: "pending" | "verified" | "failed" }>;
}

/** Simulated identity check. Its result is labelled "test" everywhere it appears. */
export const mockIdentityProvider: IdentityProvider = {
  name: "mock-identity",
  isTest: true,
  async start() {
    return { ref: `idv_test_${crypto.randomUUID().slice(0, 12)}`, status: "verified" };
  },
};
