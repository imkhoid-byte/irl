import { HOUR } from "./time";

/** Published product rules. The policies page renders these same values. */
export const POLICY = {
  defaultServiceFeeCents: 300,
  defaultLateCancelRefundPct: 50,
  invitationTtlHours: 48,
  commitmentWindowHours: 24,
  minLeadHours: 8,
  maxPendingOutgoingInvites: 5,
  maxInvitesPerDay: 10,
  checkInWindowDays: 7,
  reliabilityMinDates: 3,
  mockAuthorizationDays: 7,
} as const;

export type CancelKind = "participant" | "safety" | "venue" | "platform";

export type CancellationInput = {
  now: Date;
  deadline: Date;
  startsAt: Date;
  kind: CancelKind;
  isCanceller: boolean;
  shareCents: number;
  feeCents: number;
  lateRefundPct: number;
};

export type CancellationOutcome = {
  refundCents: number;
  keptCents: number;
  reason: "before_deadline" | "late_canceller" | "late_other_party" | "no_fault";
  summary: string;
};

export class PolicyError extends Error {}

/**
 * Refund owed to ONE participant of a confirmed (paid) date when it is cancelled.
 * Unconfirmed dates never reach this: their authorizations are simply released.
 */
export function cancellationOutcome(input: CancellationInput): CancellationOutcome {
  const paid = input.shareCents + input.feeCents;
  if (input.kind !== "participant") {
    return { refundCents: paid, keptCents: 0, reason: "no_fault", summary: "Full refund, including the service fee." };
  }
  if (input.now.getTime() >= input.startsAt.getTime()) {
    throw new PolicyError("This date has already started. Use “Report an issue” instead of cancelling.");
  }
  if (input.now.getTime() < input.deadline.getTime()) {
    return { refundCents: paid, keptCents: 0, reason: "before_deadline", summary: "Full refund, including the service fee." };
  }
  if (!input.isCanceller) {
    return { refundCents: paid, keptCents: 0, reason: "late_other_party", summary: "Full refund — the other person cancelled late." };
  }
  const pct = Math.min(100, Math.max(0, input.lateRefundPct));
  const refundCents = Math.floor((input.shareCents * pct) / 100);
  return {
    refundCents,
    keptCents: paid - refundCents,
    reason: "late_canceller",
    summary: `${pct}% of your share back. The service fee is non-refundable after the deadline.`,
  };
}

export function cancellationDeadline(startsAt: Date | string, cancellationHours: number): Date {
  return new Date(new Date(startsAt).getTime() - cancellationHours * HOUR);
}

export type ReliabilityInput = { attended: number; upheldNoShows: number };
export type Reliability =
  | { tier: "new"; label: string; datesCounted: number }
  | { tier: "reliable" | "consistent"; label: string; datesCounted: number }
  | { tier: "building"; label: string; datesCounted: number };

/**
 * Only verified attendance counts, and only upheld no-shows (after review) count
 * against someone. Low reliability is never shown publicly as a score — it simply
 * reads as "building history".
 */
export function reliability({ attended, upheldNoShows }: ReliabilityInput): Reliability {
  const datesCounted = attended + upheldNoShows;
  if (datesCounted < POLICY.reliabilityMinDates) return { tier: "new", label: "New to ONCE", datesCounted };
  const rate = attended / datesCounted;
  if (upheldNoShows === 0) return { tier: "reliable", label: `Showed up to all ${attended} dates`, datesCounted };
  if (rate >= 0.8) return { tier: "consistent", label: "Consistently shows up", datesCounted };
  return { tier: "building", label: "Building history", datesCounted };
}
