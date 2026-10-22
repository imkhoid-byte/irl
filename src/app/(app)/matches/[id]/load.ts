import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getMatchView } from "@/server/services/dates";
import { AppError } from "@/server/errors";

/** Load a date for its participant, or 404 (same response whether it doesn't exist or isn't theirs). */
export function loadMatch(userId: string, matchId: string) {
  try {
    return getMatchView(getDb(), userId, matchId);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
}
