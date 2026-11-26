/**
 * One isolated world per (case, rep): a fresh in-memory database seeded with
 * the demo data, a fixed clock, and a tool executor that records every call.
 * Nothing leaks between trials.
 */
import { all, one, openDb } from "@/server/db";
import { seed, DEMO_USERS } from "@/server/db/seed";
import { createCtx, type Ctx } from "@/server/context";
import { setNowForTests } from "@/lib/time";
import { executeTool, type ToolOutcome } from "@/agent/tools";

/** The eval clock: Monday 19 Oct 2026, 10:00 New York. Every trial sees the same inventory. */
export const EVAL_NOW = new Date("2026-10-19T14:00:00Z");

export type ToolCall = { name: string; input: unknown; ok: boolean; output: unknown };

export type EvalEnv = {
  ctx: Ctx;
  users: Record<string, string>;
  userId: string;
  firstName: string;
  calls: ToolCall[];
  exec: (name: string, input: unknown) => ToolOutcome;
  /** Rows that existed before the agent ran, so graders can diff side effects. */
  before: { invitations: Set<string>; payments: Set<string> };
};

const EMAILS: Record<string, string> = {
  ava: DEMO_USERS.ava,
  ben: DEMO_USERS.ben,
  leo: "leo@demo.once.date",
  theo: "theo@demo.once.date",
  marcus: "marcus@demo.once.date",
  jordan: "jordan@demo.once.date",
};

export async function createEnv(setup?: (env: Omit<EvalEnv, "before">) => void | Promise<void>): Promise<EvalEnv> {
  setNowForTests(EVAL_NOW);
  const db = openDb(":memory:");
  seed(db);
  const ctx = createCtx(db);
  const users = Object.fromEntries(Object.entries(EMAILS).map(([k, email]) => [k, one<{ id: string }>(db, "SELECT id FROM users WHERE email = ?", email)!.id]));
  const calls: ToolCall[] = [];
  const base = {
    ctx,
    users,
    userId: users.ava,
    firstName: "Ava",
    calls,
    exec(name: string, input: unknown) {
      const r = executeTool({ ctx, userId: users.ava }, name, input);
      calls.push({ name, input, ok: r.ok, output: r.ok ? r.output : r.error });
      return r;
    },
  };
  await setup?.(base);
  calls.length = 0; // setup calls aren't the agent's
  return {
    ...base,
    before: {
      invitations: new Set(all<{ id: string }>(db, "SELECT id FROM date_invitations").map((r) => r.id)),
      payments: new Set(all<{ id: string }>(db, "SELECT id FROM payment_intents").map((r) => r.id)),
    },
  };
}

export type NewInvitation = { id: string; to_user_id: string; slot_id: string; category: string; starts_at: string; share_cents: number; title: string };

/** Invitations the agent created during the trial. */
export function newInvitations(env: EvalEnv): NewInvitation[] {
  return all<NewInvitation>(
    env.ctx.db,
    `SELECT i.id, i.to_user_id, i.slot_id, e.category, s.starts_at, e.total_price_cents / 2 AS share_cents, e.title
       FROM date_invitations i JOIN availability_slots s ON s.id = i.slot_id JOIN date_experiences e ON e.id = s.experience_id
      WHERE i.from_user_id = ?`,
    env.userId,
  ).filter((i) => !env.before.invitations.has(i.id));
}

export function newPayments(env: EvalEnv): string[] {
  return all<{ id: string }>(env.ctx.db, "SELECT id FROM payment_intents").map((r) => r.id).filter((id) => !env.before.payments.has(id));
}
