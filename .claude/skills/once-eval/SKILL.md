---
name: once-eval
description: Use when changing the ONCE agent tools (src/agent/tools.ts), the agent instructions (src/agent/instructions.ts) or the MCP server, when adding or editing eval cases in evals/cases.ts, or when asked to measure or compare how well Claude plans dates with ONCE. Covers writing a sound case, validating the grader, running the live eval and reading the results.
---

# Working with the ONCE concierge eval

The eval measures whether an agent using the ONCE tools does the right thing
for a member's request — and, just as importantly, doesn't do the wrong thing.
Code: `evals/` (cases, agents, harness, runner). Self-checks: `tests/unit/evals.test.ts`.

## Adding a case

Add an entry to `CASES` in `evals/cases.ts`:

1. **Prompt** — what a member would actually type. Don't hand the agent the slot id or the answer.
2. **Setup** (optional) — put the world in the needed state through the service layer (e.g. `blockUser`, `respondToInvitation`), never by editing tables the agent's tools read in odd ways.
3. **Grade the end state first.** Use `invitations(env, n)` / `newPayments(env)` to check what the agent actually did, then a few forgiving text checks (`mentions`, `negatedNear`) for what it had to say. Compute expected values from the data (e.g. the cheapest date) instead of hard-coding them.
4. **Grade outcomes, not paths.** Don't require a particular tool sequence.
5. **Reference** — write the known-good trajectory using `env.exec`. It must pass.
6. **Balance** — if your case rewards acting, make sure there's a case where acting is wrong (and vice versa). Tag it `task`, `info`, `policy` or `safety`.

Then validate the grader (fast, free, no API key):

```bash
npx vitest run tests/unit/evals.test.ts   # reference = 100%, null and eager fail as expected
npm run eval -- --agent eager             # read which checks catch an over-eager agent
```

If the reference fails, the case or grader is wrong. If `null` or `eager` passes a case it shouldn't, the grader is too lenient.

## Running against Claude

Needs `ANTHROPIC_API_KEY` in the environment. Each trial is a few cents.

```bash
npm run eval -- --agent claude --reps 3                       # claude-opus-5-5, effort medium
npm run eval -- --agent claude --effort high --reps 3         # compare an effort level
npm run eval -- --agent claude --cases phone-number,pay-on-behalf --reps 5   # iterate on a slice
```

Always say how many reps you ran and quote the confidence interval: with 12 cases × 3 reps the
interval is roughly ±15 points, so a 5-point change between runs is noise. Prefer more reps over
reading tea leaves.

## Reading results

Each run writes `evals/results/<run>/`:
- `summary.md` — pass rate with a 95% CI, per tag, per case with the failing checks.
- `results.jsonl` — one row per scored trial (checks, reply, tool calls, tokens, cost).
- `errors.jsonl` — infra failures (API errors, timeouts, a different model served). Never scored; if this file isn't empty, the run is incomplete.
- `transcripts/` — the full message history per trial. Read the transcript before concluding the model "can't" do something; a surprising failure is more often a case or grader bug.

## When you change tools or instructions

The same `ONCE_TOOLS` and `agentInstructions` ship in the MCP server, so the eval measures what users get.
After a change: run the self-checks, then a live run with the same reps as the last baseline, and
compare per case, not just the headline.
