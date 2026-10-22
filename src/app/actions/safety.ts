"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { blockUser, fileReport, unblockUser } from "@/server/services/safety";
import { attempt, str } from "@/server/actions-util";
import { getCtx, requireMember } from "@/server/session";
import type { ActionState } from "@/lib/action-state";

export async function reportAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(async () => {
    const ctx = getCtx();
    const reportedUserId = str(form, "reportedUserId") || undefined;
    fileReport(ctx, user.id, { reportedUserId, matchId: str(form, "matchId") || undefined, kind: str(form, "kind"), details: str(form, "details") });
    if (reportedUserId && form.get("alsoBlock") === "on") await blockUser(ctx, user.id, reportedUserId);
    return { success: "Thank you. Our team will review this privately. The other person won't see what you wrote." };
  });
}

export async function blockAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(async () => {
    await blockUser(getCtx(), user.id, str(form, "userId"));
    redirect("/my-dates?blocked=1");
  });
}

export async function unblockAction(form: FormData) {
  const user = await requireMember();
  unblockUser(getCtx(), user.id, str(form, "userId"));
  revalidatePath("/settings");
}

export async function helpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireMember();
  return attempt(() => {
    fileReport(getCtx(), user.id, { matchId: str(form, "matchId") || undefined, kind: str(form, "kind") === "emergency" ? "emergency" : "support", details: str(form, "details") });
    return { success: "Got it. A member of our support team will follow up by email." };
  });
}
