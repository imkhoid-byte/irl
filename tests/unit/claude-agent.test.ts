import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { setNowForTests } from "@/lib/time";
import { CASES } from "../../evals/cases";
import { claudeAgent } from "../../evals/agents";
import { runTrial } from "../../evals/harness";

// A local stand-in for POST /v1/messages that replays a scripted conversation,
// so the real agent loop (request shape, tool execution, tool_result threading,
// usage accounting, served-model check) is exercised without a key or network.
type Script = (body: { messages: { role: string; content: unknown }[] }) => object;
let server: http.Server;
let script: Script;
const bodies: { model: string; tools: { name: string }[]; messages: { role: string; content: unknown }[]; system: string; betas?: unknown }[] = [];

const msg = (content: object[], stop_reason: string, model = "claude-opus-5-5") => ({
  id: `msg_${bodies.length}`, type: "message", role: "assistant", model, content, stop_reason, stop_sequence: null,
  usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const body = JSON.parse(data);
      bodies.push(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(script(body)));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
});

afterAll(() => {
  server.close();
  setNowForTests(null);
});

const policyCase = CASES.find((c) => c.id === "policy-fee")!;

describe("Claude agent loop (against a stubbed Messages API)", () => {
  it("runs tools, threads results back, and grades the final reply", async () => {
    bodies.length = 0;
    script = (body) =>
      body.messages.length === 1
        ? msg([{ type: "tool_use", id: "tu_1", name: "explain_policy", input: {} }], "tool_use")
        : msg([{ type: "text", text: "Each of you pays a $3 service fee on top of your half." }], "end_turn");
    const t = await runTrial(claudeAgent({ model: "claude-opus-5-5", effort: "medium" }), policyCase, 1);
    expect(t.error).toBeUndefined();
    expect(t.row?.pass).toBe(true);
    expect(t.row?.turns).toBe(2);
    expect(t.row?.toolCalls.map((c) => c.name)).toEqual(["explain_policy"]);
    expect(t.row?.usage).toEqual({ input: 2000, output: 200, cacheRead: 1000, cacheWrite: 0 });
    expect(t.row?.costUsd).toBeCloseTo((2000 * 4 + 200 * 20 + 1000 * 0.2) / 1e6);

    // What we sent: the shipped instructions, all six tools, and the tool result in a user turn.
    expect(bodies[0].system).toMatch(/no chat/);
    expect(bodies[0].tools.map((x) => x.name)).toContain("send_invitation");
    const second = bodies[1].messages;
    const toolResult = (second[2].content as { type: string; tool_use_id: string; content: string }[])[0];
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
    expect(JSON.parse(toolResult.content).service_fee).toMatch(/\$3/);
  });

  it("reports a different serving model as an infra error, never a score", async () => {
    script = () => msg([{ type: "text", text: "$3 each" }], "end_turn", "claude-opus-4-8");
    const t = await runTrial(claudeAgent({ model: "claude-opus-5-5", effort: "medium" }), policyCase, 1);
    expect(t.row).toBeUndefined();
    expect(t.error?.kind).toBe("served_model_mismatch");
  });

  it("records refusals and truncation as their own statuses, not passes", async () => {
    script = () => msg([{ type: "text", text: "$3 each" }], "max_tokens");
    const truncated = await runTrial(claudeAgent({ model: "claude-opus-5-5", effort: "medium" }), policyCase, 1);
    expect(truncated.row).toMatchObject({ status: "truncated", pass: false });
    script = () => msg([], "refusal");
    const refused = await runTrial(claudeAgent({ model: "claude-opus-5-5", effort: "medium" }), policyCase, 1);
    expect(refused.row).toMatchObject({ status: "refused", pass: false });
  });

  it("returns business-rule failures to the model as tool errors", async () => {
    script = (body) =>
      body.messages.length === 1
        ? msg([{ type: "tool_use", id: "tu_x", name: "send_invitation", input: { slot_id: "nope", to_user_id: "nope" } }], "tool_use")
        : msg([{ type: "text", text: "That date isn't available." }], "end_turn");
    bodies.length = 0;
    await runTrial(claudeAgent({ model: "claude-opus-5-5", effort: "medium" }), policyCase, 1);
    const result = (bodies[1].messages[2].content as { is_error: boolean }[])[0];
    expect(result.is_error).toBe(true);
  });
});
