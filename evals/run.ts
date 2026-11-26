/**
 * Run the ONCE concierge eval.
 *
 *   npm run eval -- --agent reference              # oracle: must be 100%
 *   npm run eval -- --agent null                   # do-nothing baseline: must fail the act/answer cases
 *   npm run eval -- --agent eager                  # always-invite baseline: must fail the don't-act cases
 *   npm run eval -- --agent claude --reps 3        # the real thing (needs ANTHROPIC_API_KEY)
 *
 * Options: --model claude-opus-5-5  --effort low|medium|high|xhigh|max  --reps N
 *          --cases id1,id2  --concurrency N  --out evals/results/<name>
 *
 * Writes results.jsonl (scored trials), errors.jsonl (infra failures, never
 * scored), transcripts/<case>__r<rep>.json and summary.md.
 */
import fs from "node:fs";
import path from "node:path";
import { CASES } from "./cases";
import { claudeAgent, eagerAgent, nullAgent, referenceAgent, type Agent, type Effort } from "./agents";
import { runEval, summarize } from "./harness";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  const agentName = arg("agent", "reference")!;
  const model = arg("model", "claude-opus-5-5")!;
  const effort = arg("effort", "medium") as Effort;
  const reps = Number(arg("reps", "1"));
  const concurrency = Number(arg("concurrency", agentName === "claude" ? "4" : "1"));
  const only = arg("cases")?.split(",");
  const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
  if (only && cases.length !== only.length) throw new Error(`Unknown case id in --cases. Known: ${CASES.map((c) => c.id).join(", ")}`);

  const agent: Agent =
    agentName === "claude" ? claudeAgent({ model, effort }) : agentName === "null" ? nullAgent : agentName === "eager" ? eagerAgent : agentName === "reference" ? referenceAgent : (() => { throw new Error(`--agent must be claude, reference, null or eager`); })();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = arg("out", path.join("evals", "results", `${stamp}-${agentName}${agentName === "claude" ? `-${model}-${effort}` : ""}`))!;
  fs.mkdirSync(path.join(out, "transcripts"), { recursive: true });

  console.error(`Running ${cases.length} case(s) × ${reps} rep(s) with agent=${agentName}${agentName === "claude" ? ` model=${model} effort=${effort}` : ""}`);
  const { rows, errors } = await runEval(agent, {
    cases,
    reps,
    concurrency,
    onTrial: (t, c, rep) => {
      if (t.transcript) fs.writeFileSync(path.join(out, "transcripts", `${c.id}__r${rep}.json`), JSON.stringify({ case: c.id, prompt: c.prompt, rep, row: t.row, transcript: t.transcript }, null, 2));
      console.error(`  ${t.row ? (t.row.pass ? "PASS" : "FAIL") : "ERR "} ${c.id} r${rep}${t.error ? ` — ${t.error.kind}: ${t.error.message.split("\n")[0]}` : ""}`);
    },
  });

  fs.writeFileSync(path.join(out, "results.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(out, "errors.jsonl"), errors.map((e) => JSON.stringify(e)).join("\n") + (errors.length ? "\n" : ""));
  const summary = summarize(rows, errors, { agent: agentName, model: agentName === "claude" ? model : null, effort: agentName === "claude" ? effort : undefined, reps });
  fs.writeFileSync(path.join(out, "summary.md"), summary.markdown + "\n");
  console.log(summary.markdown);
  console.error(`\nResults written to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
