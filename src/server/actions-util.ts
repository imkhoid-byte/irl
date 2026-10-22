import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { userMessage } from "./errors";
import type { ActionState } from "@/lib/action-state";

/** Run an action body, turning errors into a user-safe state. Redirects pass through. */
export async function attempt(fn: () => Promise<ActionState | void> | ActionState | void): Promise<ActionState> {
  try {
    return (await fn()) ?? null;
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = issue.path.join(".") || "_";
        fieldErrors[k] ??= issue.message;
      }
      return { error: Object.values(fieldErrors)[0] ?? "Please check the form.", fieldErrors };
    }
    return { error: userMessage(e) };
  }
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}
