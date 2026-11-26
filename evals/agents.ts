/**
 * Agents under evaluation.
 *
 *   claude     Claude on the Messages API with the ONCE tools — the system under test.
 *   reference  Each case's known-good trajectory (oracle). Must score 100%, or the grader is broken.
 *   null       Does nothing and declines. Must fail every case that requires acting or answering,
 *              or the grader is too lenient.
 *   eager      Always invites the first person it finds and claims success. Must fail every case
 *              where the right move is NOT to act, or the safety checks are too lenient.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ONCE_TOOLS, toolJsonSchema, type OnceTool } from "@/agent/tools";
import type { EvalCase } from "./cases";
import type { EvalEnv } from "./env";

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type AgentStatus = "ok" | "truncated" | "refused" | "turn_limit";

export type AgentRun = {
  text: string;
  status: AgentStatus;
  stopReason?: string;
  turns: number;
  usage: Usage;
  servedModel?: string;
  /** Time spent waiting on the model only (excludes tool execution and retries' backoff where measurable). */
  modelMs: number;
  transcript: unknown[];
};

/** A failure of the plumbing, not the model. Goes to errors.jsonl, never into the score. */
export class InfraError extends Error {
  constructor(
    public kind: "api_error" | "timeout" | "served_model_mismatch",
    message: string,
  ) {
    super(message);
  }
}

export interface Agent {
  name: string;
  model?: string;
  run(env: EvalEnv, c: EvalCase, system: string): Promise<AgentRun>;
}

const zeroUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export const referenceAgent: Agent = {
  name: "reference",
  async run(env, c) {
    const text = c.reference(env);
    return { text, status: "ok", turns: 0, usage: zeroUsage(), modelMs: 0, transcript: env.calls };
  },
};

export const nullAgent: Agent = {
  name: "null",
  async run() {
    return { text: "Sorry, I can't help with that.", status: "ok", turns: 0, usage: zeroUsage(), modelMs: 0, transcript: [] };
  },
};

export const eagerAgent: Agent = {
  name: "eager",
  async run(env) {
    const found = env.exec("search_dates", {});
    const slot = found.ok ? (found.output as { results: { slot_id: string }[] }).results[0] : undefined;
    const people = slot ? env.exec("suggest_people", { slot_id: slot.slot_id }) : undefined;
    const p = people?.ok ? (people.output as { people: { user_id: string }[] }).people[0] : undefined;
    if (slot && p) env.exec("send_invitation", { slot_id: slot.slot_id, to_user_id: p.user_id });
    return { text: "Done! I've booked you a date and passed along your details.", status: "ok", turns: 0, usage: zeroUsage(), modelMs: 0, transcript: env.calls };
  },
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function claudeAgent(opts: { model: string; effort: Effort; maxTurns?: number; caseTimeoutMs?: number }): Agent {
  // Retries (with backoff) are the SDK's: 429/5xx/connection errors, up to 4 attempts.
  const client = new Anthropic({ maxRetries: 4, timeout: 120_000 });
  const tools: Anthropic.Beta.BetaTool[] = (ONCE_TOOLS as readonly OnceTool[]).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: toolJsonSchema(t) as Anthropic.Beta.BetaTool.InputSchema,
  }));
  const maxTurns = opts.maxTurns ?? 12;

  return {
    name: "claude",
    model: opts.model,
    async run(env, c, system) {
      const deadline = Date.now() + (opts.caseTimeoutMs ?? 300_000);
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: c.prompt }];
      const usage = zeroUsage();
      const said: string[] = [];
      let modelMs = 0;

      for (let turn = 1; turn <= maxTurns; turn++) {
        if (Date.now() > deadline) throw new InfraError("timeout", `case exceeded ${opts.caseTimeoutMs ?? 300_000}ms`);
        const t0 = Date.now();
        let resp: Anthropic.Beta.BetaMessage;
        try {
          resp = await client.beta.messages.create({
            model: opts.model,
            max_tokens: 16000,
            system,
            tools,
            messages,
            // Tools + system are identical across turns and cases: cache them.
            cache_control: { type: "ephemeral" },
            output_config: { effort: opts.effort },
            // On a safety-classifier refusal, re-run on a fallback model. A trial a fallback
            // served is reported as a served-model mismatch, not scored for this model.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          });
        } catch (e) {
          if (e instanceof Anthropic.APIError) throw new InfraError("api_error", `${e.status ?? "connection"}: ${e.message}`);
          throw e;
        }
        modelMs += Date.now() - t0;
        usage.input += resp.usage.input_tokens;
        usage.output += resp.usage.output_tokens;
        usage.cacheRead += resp.usage.cache_read_input_tokens ?? 0;
        usage.cacheWrite += resp.usage.cache_creation_input_tokens ?? 0;

        const fellBack = (resp.usage.iterations ?? []).some((it) => it.type === "fallback_message");
        if (fellBack || resp.model !== opts.model) throw new InfraError("served_model_mismatch", `asked for ${opts.model}, served by ${resp.model}`);

        messages.push({ role: "assistant", content: resp.content });
        for (const b of resp.content) if (b.type === "text" && b.text.trim()) said.push(b.text.trim());
        const base = { turns: turn, usage, servedModel: resp.model, modelMs, transcript: messages, stopReason: resp.stop_reason ?? undefined };

        if (resp.stop_reason === "refusal") return { ...base, text: said.join("\n\n"), status: "refused" };
        if (resp.stop_reason === "max_tokens") return { ...base, text: said.join("\n\n"), status: "truncated" };

        const toolUses = resp.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        if (resp.stop_reason !== "tool_use" || toolUses.length === 0) return { ...base, text: said.join("\n\n"), status: "ok" };

        // All results go back in ONE user message (keeps parallel tool use working).
        messages.push({
          role: "user",
          content: toolUses.map((tu) => {
            const r = env.exec(tu.name, tu.input);
            return { type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify(r.ok ? r.output : { error: r.error }), is_error: !r.ok };
          }),
        });
      }
      return { text: said.join("\n\n"), status: "turn_limit", turns: maxTurns, usage, modelMs, transcript: messages };
    },
  };
}

/** List prices per million tokens (USD). Cache writes at 1.25x input (5-minute TTL). */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
};

export function costUsd(model: string | undefined, u: Usage): number | null {
  const p = model ? PRICES[model] : undefined;
  if (!p) return null;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.input * 1.25) / 1_000_000;
}
