"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { confirmAttendanceIntent, confirmDetails, requestReschedule, respondToInvitation, sendInvitation, withdrawInvitation, withdrawReschedule } from "@/server/services/dates";
import { commitPayment } from "@/server/services/payments";
import { cancelMatch, respondToReschedule, simulateDateHappened } from "@/server/services/lifecycle";
import { submitCheckIn } from "@/server/services/feedback";
import { attempt, str } from "@/server/actions-util";
import { getCtx, requireMember } from "@/server/session";
import type { ActionState } from "@/lib/action-state";

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(() => {
    const repeatOfMatchId = str(form, "repeatOf") || undefined;
    sendInvitation(getDb(), user.id, { slotId: str(form, "slotId"), toUserId: str(form, "toUserId"), repeatOfMatchId });
    revalidatePath(`/dates/${str(form, "slotId")}`);
    if (repeatOfMatchId) redirect(`/matches/${repeatOfMatchId}?invited=1`);
    return { success: "Invitation sent. We'll let you know as soon as they answer." };
  });
}

export async function withdrawInvitationAction(form: FormData) {
  const user = await requireMember();
  withdrawInvitation(getDb(), user.id, str(form, "invitationId"));
  revalidatePath("/my-dates");
  redirect("/my-dates");
}

export async function respondInvitationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(() => {
    const accept = str(form, "decision") === "accept";
    const { matchId } = respondToInvitation(getDb(), user.id, str(form, "invitationId"), accept);
    revalidatePath("/my-dates");
    if (matchId) redirect(`/matches/${matchId}/commit`);
    redirect("/my-dates?declined=1");
  });
}

export async function confirmDetailsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(() => {
    if (form.get("agree") !== "on") return { error: "Please tick the box to confirm the exact details." };
    confirmDetails(getDb(), user.id, str(form, "matchId"), str(form, "termsHash"));
    revalidatePath(`/matches/${str(form, "matchId")}/commit`);
  });
}

export async function payAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(async () => {
    const matchId = str(form, "matchId");
    const intent = await commitPayment(getCtx(), user.id, matchId, { paymentMethod: str(form, "paymentMethod"), idempotencyKey: str(form, "idempotencyKey") });
    revalidatePath(`/matches/${matchId}`);
    if (intent.status === "failed") return { error: `${intent.failure_reason ?? "Your payment was declined."} Nothing was charged — try another card.` };
    redirect(`/matches/${matchId}?committed=1`);
  });
}

export async function cancelMatchAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(async () => {
    const matchId = str(form, "matchId");
    await cancelMatch(getCtx(), user.id, matchId, { reason: str(form, "reason") || "participant" });
    redirect(`/matches/${matchId}`);
  });
}

export async function attendAction(form: FormData) {
  const user = await requireMember();
  confirmAttendanceIntent(getDb(), user.id, str(form, "matchId"));
  revalidatePath(`/matches/${str(form, "matchId")}`);
}

export async function requestRescheduleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(() => {
    const matchId = str(form, "matchId");
    requestReschedule(getDb(), user.id, matchId, str(form, "slotId"));
    redirect(`/matches/${matchId}?moved=requested`);
  });
}

export async function respondRescheduleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(async () => {
    await respondToReschedule(getCtx(), user.id, str(form, "requestId"), str(form, "decision") === "accept");
    revalidatePath(`/matches/${str(form, "matchId")}`);
    return { success: str(form, "decision") === "accept" ? "Done — your date has moved." : "Your original time stands." };
  });
}

export async function withdrawRescheduleAction(form: FormData) {
  const user = await requireMember();
  withdrawReschedule(getDb(), user.id, str(form, "requestId"));
  revalidatePath(`/matches/${str(form, "matchId")}`);
}

export async function simulateHappenedAction(form: FormData) {
  const user = await requireMember();
  simulateDateHappened(getCtx(), user.id, str(form, "matchId"));
  redirect(`/matches/${str(form, "matchId")}/check-in`);
}

export async function checkInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(() => {
    const matchId = str(form, "matchId");
    const r = submitCheckIn(getCtx(), user.id, matchId, Object.fromEntries(form.entries()));
    redirect(r.feltSafe ? `/matches/${matchId}?checked=1` : `/help?match=${matchId}&unsafe=1`);
  });
}
