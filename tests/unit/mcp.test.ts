import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Spawns the real server over stdio, as Claude Desktop / Claude Code would.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "once-mcp-"));
let client: Client;

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);
const json = (r: unknown) => JSON.parse(text(r));

beforeAll(async () => {
  client = new Client({ name: "once-test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: "npx",
      args: ["tsx", "mcp/server.ts"],
      env: { ...process.env, ONCE_DB_PATH: path.join(dir, "once.db"), ONCE_USER_EMAIL: "ava@demo.once.date" } as Record<string, string>,
      stderr: "ignore",
    }),
  );
}, 60_000);

afterAll(async () => {
  await client?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ONCE MCP server", () => {
  it("serves instructions and exactly the intended tool surface", async () => {
    expect(client.getInstructions()).toMatch(/no chat/i);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["explain_policy", "get_date", "list_my_dates", "search_dates", "send_invitation", "suggest_people"]);
    // Nothing that moves money or opens a channel between members.
    expect(tools.some((t) => /pay|commit|cancel|message|chat|contact/.test(t.name))).toBe(false);
    expect(tools.find((t) => t.name === "send_invitation")?.annotations?.readOnlyHint).toBe(false);
    expect(tools.find((t) => t.name === "search_dates")?.annotations?.readOnlyHint).toBe(true);
  });

  it("finds a date, suggests people and sends an invitation through the real service layer", async () => {
    const found = json(await client.callTool({ name: "search_dates", arguments: { category: "coffee", when: "week" } }));
    expect(found.count).toBeGreaterThan(0);
    const slot = found.results[0];
    expect(slot.price.each).toBe("$12");
    const { people } = json(await client.callTool({ name: "suggest_people", arguments: { slot_id: slot.slot_id } }));
    expect(people.length).toBeGreaterThan(0);
    expect(people[0]).not.toHaveProperty("email");
    const sent = json(await client.callTool({ name: "send_invitation", arguments: { slot_id: slot.slot_id, to_user_id: people[0].user_id } }));
    expect(sent.status).toBe("pending");
    const mine = json(await client.callTool({ name: "list_my_dates", arguments: {} }));
    expect(mine.invitations.some((i: { invitation_id: string }) => i.invitation_id === sent.invitation_id)).toBe(true);
  });

  it("returns business-rule violations as tool errors, not crashes", async () => {
    const r = await client.callTool({ name: "send_invitation", arguments: { slot_id: "nope", to_user_id: "nope" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/isn't available|no longer available/);
  });

  it("offers a plan_a_date prompt", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("plan_a_date");
  });
});
