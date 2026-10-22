import { afterEach, describe, expect, it } from "vitest";
import { one } from "@/server/db";
import { setNowForTests } from "@/lib/time";
import { setup, slotFor, key } from "./helpers";
import { confirmDetails, getInvitation, getMatchRow, getMatchView, respondToInvitation, sendInvitation } from "@/server/services/dates";
import { commitPayment } from "@/server/services/payments";
import { simulateDateHappened } from "@/server/services/lifecycle";
import { submitCheckIn } from "@/server/services/feedback";
import { blockUser, fileReport } from "@/server/services/safety";
import { analytics, assertAdmin, resolveReport } from "@/server/services/admin";
import { candidatesForSlot } from "@/server/services/discovery";
import { login, register, userFromSession } from "@/server/services/auth";
import { completeOnboarding, getOwnProfile, reliabilityFor } from "@/server/services/profiles";

afterEach(() => setNowForTests(null));

async function confirmedDate(ctx: ReturnType<typeof setup>) {
  const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
  const inv = sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ben });
  const matchId = respondToInvitation(ctx.db, ctx.users.ben, inv, true).matchId!;
  for (const u of [ctx.users.ava, ctx.users.ben]) {
    confirmDetails(ctx.db, u, matchId, getMatchRow(ctx.db, matchId)!.terms_hash);
    await commitPayment(ctx, u, matchId, { paymentMethod: "pm_card_visa", idempotencyKey: key() });
  }
  return matchId;
}

const answers = { attended: "yes", otherAttended: "yes", feltSafe: "yes", openToAnother: "yes", experienceRating: 5, venueRating: 4 };

describe("matching rules", () => {
  it("a user can't match with themselves", () => {
    const ctx = setup();
    const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
    expect(() => sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ava })).toThrow(/yourself/);
  });

  it("respects mutual preferences", () => {
    const ctx = setup();
    const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
    // Ava is interested in men; Elena is a woman interested in men.
    expect(() => sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.elena })).toThrow(/isn't available/);
  });

  it("blocking removes someone from suggestions and prevents invitations", async () => {
    const ctx = setup();
    const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
    expect(candidatesForSlot(ctx.db, ctx.users.ava, slotId).some((c) => c.userId === ctx.users.ben)).toBe(true);
    await blockUser(ctx, ctx.users.ben, ctx.users.ava);
    expect(candidatesForSlot(ctx.db, ctx.users.ava, slotId).some((c) => c.userId === ctx.users.ben)).toBe(false);
    expect(() => sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ben })).toThrow(/isn't available/);
  });

  it("blocking cancels a confirmed date with full refunds for both", async () => {
    const ctx = setup();
    const matchId = await confirmedDate(ctx);
    await blockUser(ctx, ctx.users.ava, ctx.users.ben);
    expect(getMatchRow(ctx.db, matchId)!.status).toBe("cancelled");
    const refunded = one<{ n: number }>(ctx.db, "SELECT COUNT(*) AS n FROM payment_intents WHERE match_id = ? AND status = 'refunded'", matchId)!.n;
    expect(refunded).toBe(2);
  });
});

describe("authorization", () => {
  it("only participants can see a date or an invitation", async () => {
    const ctx = setup();
    const matchId = await confirmedDate(ctx);
    expect(() => getMatchView(ctx.db, ctx.users.chloe, matchId)).toThrow(/couldn't find/);
    const inv = one<{ invitation_id: string }>(ctx.db, "SELECT invitation_id FROM matches WHERE id = ?", matchId)!.invitation_id;
    expect(() => getInvitation(ctx.db, ctx.users.chloe, inv)).toThrow(/couldn't find/);
  });

  it("only the invitee can accept", () => {
    const ctx = setup();
    const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
    const inv = sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ben });
    expect(() => respondToInvitation(ctx.db, ctx.users.ava, inv, true)).toThrow(/couldn't find/);
    expect(() => respondToInvitation(ctx.db, ctx.users.chloe, inv, true)).toThrow(/couldn't find/);
  });

  it("someone else can't pay into (or see the payment state of) your date", async () => {
    const ctx = setup();
    const slotId = slotFor(ctx.db, "coffee-and-a-bookstore");
    const inv = sendInvitation(ctx.db, ctx.users.ava, { slotId, toUserId: ctx.users.ben });
    const matchId = respondToInvitation(ctx.db, ctx.users.ben, inv, true).matchId!;
    await expect(commitPayment(ctx, ctx.users.chloe, matchId, { paymentMethod: "pm_card_visa", idempotencyKey: key() })).rejects.toThrow(/couldn't find/);
  });

  it("the public profile never includes private fields", async () => {
    const ctx = setup();
    const matchId = await confirmedDate(ctx);
    const other = getMatchView(ctx.db, ctx.users.ava, matchId).other.profile as Record<string, unknown>;
    for (const k of ["email", "birthDate", "dietaryNotes", "accessibilityNotes", "budgetMaxCents", "lat", "lng"]) expect(other).not.toHaveProperty(k);
  });

  it("admin checks are enforced from the database", () => {
    const ctx = setup();
    expect(() => assertAdmin(ctx.db, ctx.users.ava)).toThrow();
    expect(() => analytics(ctx.db, ctx.users.ava)).toThrow();
    expect(() => assertAdmin(ctx.db, ctx.users.admin)).not.toThrow();
  });
});

describe("auth", () => {
  it("registers, logs in and rejects bad credentials without revealing which part was wrong", () => {
    const ctx = setup();
    const r = register(ctx.db, { email: "new@example.com", password: "a-long-password" }, "1.1.1.1");
    expect(userFromSession(ctx.db, r.token)?.id).toBe(r.userId);
    expect(() => login(ctx.db, { email: "new@example.com", password: "wrong-password" }, "1.1.1.1")).toThrow(/don't match/);
    expect(() => login(ctx.db, { email: "nobody@example.com", password: "wrong-password" }, "1.1.1.1")).toThrow(/don't match/);
    expect(() => register(ctx.db, { email: "new@example.com", password: "a-long-password" }, "1.1.1.1")).toThrow(/couldn't create/);
  });

  it("onboarding requires adults and agreement to the guidelines", () => {
    const ctx = setup();
    const r = register(ctx.db, { email: "teen@example.com", password: "a-long-password" }, "1.1.1.2");
    const hood = one<{ id: string }>(ctx.db, "SELECT id FROM neighborhoods LIMIT 1")!.id;
    const base = {
      firstName: "Teen", birthDate: "2010-01-01", gender: "woman", interestedIn: ["man"], ageMin: 18, ageMax: 40,
      bio: "Just a long enough bio for validation.", interests: ["Coffee", "Chess", "Cinema"], intention: "long_term",
      neighborhoodId: hood, travelRadiusKm: 5, preferredCategories: ["coffee"], preferredDays: ["Sat"], preferredTimes: ["morning"],
      budgetMaxCents: 5000, confirmAdult: true, acceptGuidelines: true,
    };
    expect(() => completeOnboarding(ctx.db, r.userId, base)).toThrow(/18/);
    expect(() => completeOnboarding(ctx.db, r.userId, { ...base, birthDate: "1995-01-01", acceptGuidelines: false })).toThrow();
    completeOnboarding(ctx.db, r.userId, { ...base, birthDate: "1995-01-01" });
    expect(getOwnProfile(ctx.db, r.userId)?.onboarded).toBe(true);
  });
});

describe("after the date", () => {
  it("collects independent feedback and only reveals a mutual yes", async () => {
    const ctx = setup();
    const matchId = await confirmedDate(ctx);
    simulateDateHappened(ctx, ctx.users.ava, matchId);
    submitCheckIn(ctx, ctx.users.ava, matchId, answers);
    expect(getMatchView(ctx.db, ctx.users.ava, matchId).feedback.mutualYes).toBe(false);
    expect(() => submitCheckIn(ctx, ctx.users.ava, matchId, answers)).toThrow(/already/);
    submitCheckIn(ctx, ctx.users.ben, matchId, answers);
    expect(getMatchView(ctx.db, ctx.users.ava, matchId).feedback.mutualYes).toBe(true);

    // A second date goes through the same invitation → commitment flow.
    const next = slotFor(ctx.db, "sunset-walk-and-gelato", 72);
    const again = sendInvitation(ctx.db, ctx.users.ben, { slotId: next, toUserId: ctx.users.ava, repeatOfMatchId: matchId });
    expect(respondToInvitation(ctx.db, ctx.users.ava, again, true).matchId).toBeTruthy();
  });

  it("doesn't allow a 'second date' without a mutual yes", async () => {
    const ctx = setup();
    const matchId = await confirmedDate(ctx);
    simulateDateHappened(ctx, ctx.users.ava, matchId);
    submitCheckIn(ctx, ctx.users.ava, matchId, answers);
    submitCheckIn(ctx, ctx.users.ben, matchId, { ...answers, openToAnother: "no" });
    const next = slotFor(ctx.db, "sunset-walk-and-gelato", 72);
    expect(() => sendInvitation(ctx.db, ctx.users.ava, { slotId: next, toUserId: ctx.users.ben, repeatOfMatchId: matchId })).toThrow(/both of you/);
  });

  it("a no-show report doesn't count against anyone until it's upheld", async () => {
    const ctx = setup();
    const matchId = await confirmedDate(ctx);
    simulateDateHappened(ctx, ctx.users.ava, matchId);
    submitCheckIn(ctx, ctx.users.ava, matchId, { ...answers, otherAttended: "no" });
    const report = one<{ id: string; status: string }>(ctx.db, "SELECT id, status FROM reports WHERE match_id = ? AND kind = 'no_show'", matchId)!;
    expect(report.status).toBe("open");
    const before = reliabilityFor(ctx.db, ctx.users.ben);
    await resolveReport(ctx, ctx.users.admin, report.id, "upheld", "Confirmed with venue.", true);
    const after = reliabilityFor(ctx.db, ctx.users.ben);
    expect(after.datesCounted).toBe(before.datesCounted + 1);
    // Ava gets her share back.
    expect(one<{ refunded_cents: number }>(ctx.db, "SELECT refunded_cents FROM payment_intents WHERE match_id = ? AND user_id = ?", matchId, ctx.users.ava)!.refunded_cents).toBe(1200);
  });

  it("reports require a real connection to the reported person", () => {
    const ctx = setup();
    expect(() => fileReport(ctx, ctx.users.ava, { reportedUserId: ctx.users.jordan, kind: "harassment", details: "x" })).toThrow(/couldn't find/);
  });
});

describe("demo fixtures", () => {
  it("seeds a post-date check-in waiting for Ava", () => {
    const ctx = setup();
    const m = one<{ id: string }>(ctx.db, "SELECT m.id FROM matches m JOIN match_participants mp ON mp.match_id = m.id WHERE mp.user_id = ? AND m.status = 'completed'", ctx.users.ava);
    expect(m).toBeTruthy();
  });
});
