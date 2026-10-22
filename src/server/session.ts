import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db/client";
import { createCtx, type Ctx } from "./context";
import { isAdmin, userFromSession, type SessionUser } from "./services/auth";
import { maybeSweep } from "./services/lifecycle";
import { localStorageProvider } from "./providers/storage";

export const SESSION_COOKIE = "once_session";

const g = globalThis as unknown as { __onceCtx?: Ctx };

export function getCtx(): Ctx {
  const db = getDb();
  if (!g.__onceCtx || g.__onceCtx.db !== db) g.__onceCtx = createCtx(db);
  return g.__onceCtx;
}

export const storage = localStorageProvider();

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromSession(getDb(), token);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Signed in AND onboarded. Also runs the (throttled) lifecycle sweep. */
export async function requireMember(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.onboarded) redirect("/onboarding");
  await maybeSweep(getCtx());
  return user;
}

/** Admin pages 404 for everyone else, so the area isn't even discoverable. Role comes from the database. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user || !isAdmin(getDb(), user.id)) notFound();
  return user;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
