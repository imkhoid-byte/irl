"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { addSlot, adminCancelMatch, adminRefund, createExperience, createVenue, resolveReport, setSlotStatus, setUserStatus, toggleExperience, toggleVenue } from "@/server/services/admin";
import { updateSettings } from "@/server/services/settings";
import { attempt, str } from "@/server/actions-util";
import { getCtx, requireAdmin } from "@/server/session";
import { cityTimeToUtc } from "@/lib/time";
import type { ActionState } from "@/lib/action-state";

// Every action re-checks the admin role server-side (requireAdmin), and every
// service call re-checks it again against the database (assertAdmin).

export async function setUserStatusAction(form: FormData) {
  const admin = await requireAdmin();
  setUserStatus(getDb(), admin.id, str(form, "userId"), str(form, "status") === "suspended" ? "suspended" : "active");
  revalidatePath("/admin/users");
}

export async function createVenueAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  return attempt(() => {
    createVenue(getDb(), admin.id, Object.fromEntries(form.entries()));
    revalidatePath("/admin/venues");
    return { success: "Venue added." };
  });
}

export async function toggleVenueAction(form: FormData) {
  const admin = await requireAdmin();
  toggleVenue(getDb(), admin.id, str(form, "venueId"));
  revalidatePath("/admin/venues");
}

export async function createExperienceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  return attempt(() => {
    const data = Object.fromEntries(form.entries());
    createExperience(getDb(), admin.id, { ...data, indoor: form.get("indoor") === "on" });
    revalidatePath("/admin/experiences");
    return { success: "Experience created. Add time slots to make it bookable." };
  });
}

export async function toggleExperienceAction(form: FormData) {
  const admin = await requireAdmin();
  toggleExperience(getDb(), admin.id, str(form, "experienceId"));
  revalidatePath("/admin/experiences");
}

export async function addSlotAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  return attempt(() => {
    const at = cityTimeToUtc(str(form, "date"), str(form, "time"));
    addSlot(getDb(), admin.id, str(form, "experienceId"), at.toISOString(), Number(str(form, "capacity") || 1));
    revalidatePath(`/admin/experiences/${str(form, "experienceId")}`);
    return { success: "Slot added." };
  });
}

export async function setSlotStatusAction(form: FormData) {
  const admin = await requireAdmin();
  setSlotStatus(getDb(), admin.id, str(form, "slotId"), str(form, "status") === "closed" ? "closed" : "open");
  revalidatePath(`/admin/experiences/${str(form, "experienceId")}`);
}

export async function resolveReportAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  return attempt(async () => {
    const decision = str(form, "decision") as "upheld" | "dismissed" | "resolved" | "reviewing";
    await resolveReport(getCtx(), admin.id, str(form, "reportId"), decision, str(form, "note"), form.get("refund") === "on");
    revalidatePath("/admin/reports");
    return { success: `Marked ${decision}.` };
  });
}

export async function adminRefundAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  return attempt(async () => {
    await adminRefund(getCtx(), admin.id, str(form, "intentId"), Math.round(Number(str(form, "amount")) * 100), str(form, "note"));
    revalidatePath("/admin/payments");
    return { success: "Refund issued (test)." };
  });
}

export async function adminCancelMatchAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  return attempt(async () => {
    await adminCancelMatch(getCtx(), admin.id, str(form, "matchId"));
    revalidatePath("/admin/dates");
    return { success: "Cancelled with full refunds." };
  });
}

export async function updateSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  return attempt(() => {
    updateSettings(getDb(), admin.id, { serviceFeeCents: Math.round(Number(str(form, "fee")) * 100), lateRefundPct: Number(str(form, "latePct")) });
    revalidatePath("/admin/settings");
    return { success: "Saved. New matches use these values; existing dates keep the terms they agreed to." };
  });
}
