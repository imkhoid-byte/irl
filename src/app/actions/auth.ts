"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { login, logout, register } from "@/server/services/auth";
import { attempt, str } from "@/server/actions-util";
import { clearSessionCookie, clientIp, currentUser, setSessionCookie, SESSION_COOKIE } from "@/server/session";
import { cookies } from "next/headers";
import type { ActionState } from "@/lib/action-state";

function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/discover";
}

export async function registerAction(_: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const r = register(getDb(), { email: str(form, "email"), password: str(form, "password") }, await clientIp());
    await setSessionCookie(r.token, r.expiresAt);
    redirect("/onboarding");
  });
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const r = login(getDb(), { email: str(form, "email"), password: str(form, "password") }, await clientIp());
    await setSessionCookie(r.token, r.expiresAt);
    redirect(safeNext(str(form, "next")));
  });
}

export async function logoutAction() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) logout(getDb(), token);
  await clearSessionCookie();
  redirect("/");
}

export async function demoLoginAction(form: FormData) {
  // Demo shortcut: signs in as one of the seeded demo accounts. Not available with real payments.
  if (process.env.PAYMENT_PROVIDER === "stripe") redirect("/login");
  const who = str(form, "who");
  const emails: Record<string, string> = { ava: "ava@demo.once.date", ben: "ben@demo.once.date", admin: "admin@demo.once.date" };
  if (!emails[who]) redirect("/login");
  const r = login(getDb(), { email: emails[who], password: "showup-demo" }, await clientIp());
  await setSessionCookie(r.token, r.expiresAt);
  redirect(who === "admin" ? "/admin" : "/discover");
}

export async function whoAmI() {
  return currentUser();
}
