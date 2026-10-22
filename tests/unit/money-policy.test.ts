import { describe, expect, it } from "vitest";
import { priceBreakdown, splitEvenly } from "@/lib/money";
import { cancellationOutcome, PolicyError, reliability } from "@/lib/policy";

describe("50/50 split", () => {
  it("splits an even total exactly", () => {
    expect(splitEvenly(8000)).toBe(4000);
    expect(priceBreakdown(8000, 300)).toEqual({ totalCents: 8000, shareCents: 4000, feeCents: 300, dueCents: 4300 });
  });
  it("refuses totals that can't split evenly or aren't positive", () => {
    expect(() => splitEvenly(8001)).toThrow();
    expect(() => splitEvenly(0)).toThrow();
    expect(() => splitEvenly(12.5)).toThrow();
  });
});

describe("cancellation policy", () => {
  const base = {
    now: new Date("2026-10-20T10:00:00Z"),
    deadline: new Date("2026-10-21T10:00:00Z"),
    startsAt: new Date("2026-10-22T10:00:00Z"),
    kind: "participant" as const,
    isCanceller: true,
    shareCents: 4000,
    feeCents: 300,
    lateRefundPct: 50,
  };
  it("refunds everything before the deadline", () => {
    expect(cancellationOutcome(base)).toMatchObject({ refundCents: 4300, keptCents: 0, reason: "before_deadline" });
  });
  it("refunds the late canceller a share of their half, keeping the fee", () => {
    const late = { ...base, now: new Date("2026-10-21T12:00:00Z") };
    expect(cancellationOutcome(late)).toMatchObject({ refundCents: 2000, keptCents: 2300, reason: "late_canceller" });
  });
  it("fully refunds the person who didn't cancel, even late", () => {
    const late = { ...base, now: new Date("2026-10-21T12:00:00Z"), isCanceller: false };
    expect(cancellationOutcome(late)).toMatchObject({ refundCents: 4300, reason: "late_other_party" });
  });
  it("fully refunds safety and venue cancellations", () => {
    expect(cancellationOutcome({ ...base, now: new Date("2026-10-21T12:00:00Z"), kind: "safety" }).refundCents).toBe(4300);
    expect(cancellationOutcome({ ...base, kind: "venue" }).refundCents).toBe(4300);
  });
  it("won't cancel a date that has started", () => {
    expect(() => cancellationOutcome({ ...base, now: new Date("2026-10-22T10:30:00Z") })).toThrow(PolicyError);
  });
});

describe("reliability indicator", () => {
  it("needs enough verified dates before saying anything", () => {
    expect(reliability({ attended: 2, upheldNoShows: 0 }).tier).toBe("new");
  });
  it("only claims perfect attendance when there are no upheld no-shows", () => {
    expect(reliability({ attended: 4, upheldNoShows: 0 })).toMatchObject({ tier: "reliable", label: "Showed up to all 4 dates" });
    expect(reliability({ attended: 9, upheldNoShows: 1 }).tier).toBe("consistent");
  });
  it("never displays a low score — it reads as building history", () => {
    expect(reliability({ attended: 1, upheldNoShows: 3 })).toMatchObject({ tier: "building", label: "Building history" });
  });
});
