import { getCtx } from "@/server/session";
import { sweep } from "@/server/services/lifecycle";

/** Expiries, reminders and completions. Point a scheduler (e.g. Vercel Cron) here every few minutes. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!secret && process.env.NODE_ENV === "production") return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  await sweep(getCtx());
  return Response.json({ ok: true });
}
