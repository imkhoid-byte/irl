"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { addPhoto, completeOnboarding, deleteAccount, getPhoto, photoIdsFor, removePhoto, setEmailNotifications, startVerification, updateProfile } from "@/server/services/profiles";
import { changePassword } from "@/server/services/auth";
import { attempt, str } from "@/server/actions-util";
import { clearSessionCookie, getCtx, requireUser, storage } from "@/server/session";
import type { ActionState } from "@/lib/action-state";
import { markAllRead } from "@/server/services/notifications";

export type ProfilePayload = Record<string, unknown>;

export async function onboardingAction(payload: ProfilePayload): Promise<ActionState> {
  const user = await requireUser();
  return attempt(async () => {
    completeOnboarding(getDb(), user.id, payload);
    redirect("/discover?welcome=1");
  });
}

export async function updateProfileAction(payload: ProfilePayload): Promise<ActionState> {
  const user = await requireUser();
  return attempt(async () => {
    updateProfile(getDb(), user.id, payload);
    revalidatePath("/profile");
    return { success: "Profile saved." };
  });
}

export async function uploadPhotoAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  return attempt(async () => {
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo to upload." };
    await addPhoto(getDb(), storage, user.id, new Uint8Array(await file.arrayBuffer()));
    revalidatePath("/profile");
    revalidatePath("/onboarding");
    return { success: "Photo added." };
  });
}

export async function removePhotoAction(form: FormData) {
  const user = await requireUser();
  await removePhoto(getDb(), storage, user.id, str(form, "photoId"));
  revalidatePath("/profile");
  revalidatePath("/onboarding");
}

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  return attempt(async () => {
    changePassword(getDb(), user.id, str(form, "current"), str(form, "next"));
    await clearSessionCookie();
    redirect("/login?changed=1");
  });
}

export async function emailPrefsAction(form: FormData) {
  const user = await requireUser();
  setEmailNotifications(getDb(), user.id, form.get("enabled") === "on");
  revalidatePath("/settings");
}

export async function verifyIdentityAction() {
  const user = await requireUser();
  await startVerification(getDb(), getCtx().identity, user.id);
  revalidatePath("/settings");
  revalidatePath("/profile");
}

export async function deleteAccountAction(_: ActionState): Promise<ActionState> {
  const user = await requireUser();
  return attempt(async () => {
    const db = getDb();
    const photos = photoIdsFor(db, user.id).map((id) => ({ id, key: getPhoto(db, id)!.storage_key }));
    deleteAccount(db, user.id);
    for (const p of photos) await removePhoto(db, storage, user.id, p.id).catch(() => {});
    await clearSessionCookie();
    redirect("/?deleted=1");
  });
}

export async function markNotificationsReadAction() {
  const user = await requireUser();
  markAllRead(getDb(), user.id);
  revalidatePath("/notifications");
}
