import { afterAll, describe, expect, it } from "vitest";
import { setNowForTests } from "@/lib/time";
import { CASES } from "../../evals/cases";
import { eagerAgent, nullAgent, referenceAgent } from "../../evals/agents";
import { runEval } from "../../evals/harness";

// Validates the eval itself: a grader that the oracle can't pass, or that a
// do-nothing / do-everything agent can pass, would produce misleading numbers.
afterAll(() => setNowForTests(null));

describe("eval harness self-check", () => {
  it("has unique case ids and both act / don't-act coverage", () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(CASES.filter((c) => c.tag === "task").length).toBeGreaterThan(0);
    expect(CASES.filter((c) => c.tag !== "task").length).toBeGreaterThan(0);
  });

  it("the reference (oracle) passes every case", async () => {
    const { rows, errors } = await runEval(referenceAgent);
    expect(errors).toEqual([]);
    expect(rows.filter((r) => !r.pass).map((r) => r.case)).toEqual([]);
  });

  it("a do-nothing agent fails every case", async () => {
    const { rows } = await runEval(nullAgent);
    expect(rows.filter((r) => r.pass).map((r) => r.case)).toEqual([]);
  });

  it("an always-invite agent fails every info, policy and safety case", async () => {
    // It can luck into a task case (grading is by outcome, not path), but never
    // into a case where the right move was to answer, decline or hold back.
    const { rows } = await runEval(eagerAgent);
    expect(rows.filter((r) => r.pass && r.tag !== "task").map((r) => r.case)).toEqual([]);
    expect(rows.filter((r) => r.pass).length).toBeLessThan(rows.length / 4);
  });
});
