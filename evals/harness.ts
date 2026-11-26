import { agentInstructions } from "@/agent/instructions";
import { CASES, type Check, type EvalCase } from "./cases";
import { createEnv, EVAL_NOW, type ToolCall } from "./env";
import { costUsd, InfraError, type Agent, type AgentRun, type AgentStatus, type Usage } from "./agents";

export type ResultRow = {
  case: string;
  tag: EvalCase["tag"];
  rep: number;
  agent: string;
  model: string | null;
  status: AgentStatus;
  pass: boolean;
  checks: Check[];
  reply: string;
  toolCalls: ToolCall[];
  turns: number;
  usage: Usage;
  costUsd: number | null;
  modelMs: number;
};

export type ErrorRow = { case: string; rep: number; agent: string; kind: string; message: string };

export type Trial = { row?: ResultRow; error?: ErrorRow; transcript?: AgentRun["transcript"] };

export async function runTrial(agent: Agent, c: EvalCase, rep: number): Promise<Trial> {
  const env = await createEnv(c.setup);
  const system = agentInstructions(env.firstName, EVAL_NOW);
  let run: AgentRun;
  try {
    run = await agent.run(env, c, system);
  } catch (e) {
    if (e instanceof InfraError) return { error: { case: c.id, rep, agent: agent.name, kind: e.kind, message: e.message } };
    return { error: { case: c.id, rep, agent: agent.name, kind: "harness", message: e instanceof Error ? (e.stack ?? e.message) : String(e) } };
  }
  let checks: Check[];
  try {
    checks = c.grade({ env, text: run.text });
  } catch (e) {
    return { error: { case: c.id, rep, agent: agent.name, kind: "grader", message: e instanceof Error ? (e.stack ?? e.message) : String(e) } };
  }
  // A clipped or turn-limited run is shown, but never counted as a pass.
  const pass = run.status === "ok" && checks.every((k) => k.pass);
  return {
    transcript: run.transcript,
    row: {
      case: c.id,
      tag: c.tag,
      rep,
      agent: agent.name,
      model: agent.model ?? null,
      status: run.status,
      pass,
      checks,
      reply: run.text,
      toolCalls: env.calls,
      turns: run.turns,
      usage: run.usage,
      costUsd: costUsd(run.servedModel ?? agent.model, run.usage),
      modelMs: run.modelMs,
    },
  };
}

export async function runEval(agent: Agent, opts: { cases?: EvalCase[]; reps?: number; concurrency?: number; onTrial?: (t: Trial, c: EvalCase, rep: number) => void } = {}) {
  const cases = opts.cases ?? CASES;
  const jobs = cases.flatMap((c) => Array.from({ length: opts.reps ?? 1 }, (_, r) => ({ c, rep: r + 1 })));
  const trials: Trial[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { c, rep } = jobs[next++];
      const t = await runTrial(agent, c, rep);
      trials.push(t);
      opts.onTrial?.(t, c, rep);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, jobs.length) }, worker));
  const order = (r: { case: string; rep: number }) => cases.findIndex((c) => c.id === r.case) * 1000 + r.rep;
  return {
    rows: trials.flatMap((t) => (t.row ? [t.row] : [])).sort((a, b) => order(a) - order(b)),
    errors: trials.flatMap((t) => (t.error ? [t.error] : [])).sort((a, b) => order(a) - order(b)),
    trials,
  };
}

/** Wilson score interval for a pass rate (95%). */
export function wilson(passes: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = passes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function summarize(rows: ResultRow[], errors: ErrorRow[], meta: { agent: string; model?: string | null; effort?: string; reps: number }) {
  const passes = rows.filter((r) => r.pass).length;
  const [lo, hi] = wilson(passes, rows.length);
  const tags = [...new Set(rows.map((r) => r.tag))];
  const caseIds = [...new Set(rows.map((r) => r.case))];
  const checks = rows.flatMap((r) => r.checks);
  const total = rows.reduce(
    (a, r) => ({ input: a.input + r.usage.input, output: a.output + r.usage.output, cacheRead: a.cacheRead + r.usage.cacheRead, cacheWrite: a.cacheWrite + r.usage.cacheWrite, cost: a.cost + (r.costUsd ?? 0), ms: a.ms + r.modelMs }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, ms: 0 },
  );
  const scored = rows.length;
  const lines = [
    `# ONCE concierge eval — ${meta.agent}${meta.model ? ` (${meta.model}${meta.effort ? `, effort ${meta.effort}` : ""})` : ""}`,
    "",
    `**Pass rate: ${passes}/${scored} = ${pct(scored ? passes / scored : 0)}** (95% CI ${pct(lo)}–${pct(hi)}) · ${meta.reps} rep(s) per case · checks passed ${checks.filter((c) => c.pass).length}/${checks.length}`,
    "",
    `Not scored: ${errors.length} infra error(s)${errors.length ? ` (${[...new Set(errors.map((e) => e.kind))].join(", ")})` : ""}. Refusals: ${rows.filter((r) => r.status === "refused").length}. Truncated / turn limit: ${rows.filter((r) => r.status === "truncated" || r.status === "turn_limit").length}.`,
    "",
    "| Tag | Pass rate |",
    "|---|---|",
    ...tags.map((t) => {
      const rs = rows.filter((r) => r.tag === t);
      return `| ${t} | ${rs.filter((r) => r.pass).length}/${rs.length} |`;
    }),
    "",
    "| Case | Tag | Passed | Failed checks (first rep that failed) |",
    "|---|---|---|---|",
    ...caseIds.map((id) => {
      const rs = rows.filter((r) => r.case === id);
      const failed = rs.find((r) => !r.pass);
      const why = failed ? (failed.status !== "ok" ? failed.status : failed.checks.filter((c) => !c.pass).map((c) => c.name + (c.detail ? ` (${c.detail})` : "")).join("; ")) : "";
      return `| ${id} | ${rs[0].tag} | ${rs.filter((r) => r.pass).length}/${rs.length} | ${why.replace(/\|/g, "/")} |`;
    }),
  ];
  if (total.input + total.output > 0) {
    lines.push(
      "",
      `Tokens: ${total.input.toLocaleString()} input, ${total.output.toLocaleString()} output, ${total.cacheRead.toLocaleString()} cache read, ${total.cacheWrite.toLocaleString()} cache write. ` +
        `Estimated cost at list price: $${total.cost.toFixed(2)} ($${(total.cost / Math.max(scored, 1)).toFixed(3)} per trial). Mean model time per trial: ${(total.ms / Math.max(scored, 1) / 1000).toFixed(1)}s.`,
    );
  }
  return { markdown: lines.join("\n"), passes, scored, ci: [lo, hi] as [number, number] };
}
