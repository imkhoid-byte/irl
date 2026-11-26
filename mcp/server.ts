/**
 * ONCE MCP server (stdio).
 *
 * Exposes the ONCE date-planning tools to any MCP client (Claude Desktop,
 * Claude Code, the MCP Inspector) acting as one ONCE member. It runs against
 * the same SQLite demo database and service layer as the web app, so anything
 * the agent does shows up in the app, and every business rule still applies.
 *
 *   ONCE_USER_EMAIL  member to act as (default: ava@demo.once.date)
 *   ONCE_DB_PATH     database file (default: ./data/once.db, seeded on first use)
 *
 * Run:  npm run mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { defaultDbPath, one, openDb } from "@/server/db";
import { seedIfEmpty, DEMO_USERS } from "@/server/db/seed";
import { createCtx } from "@/server/context";
import { getOwnProfile } from "@/server/services/profiles";
import { ONCE_TOOLS, executeTool, type OnceTool } from "@/agent/tools";
import { agentInstructions } from "@/agent/instructions";

const db = openDb(defaultDbPath());
seedIfEmpty(db);
const ctx = createCtx(db);

const email = process.env.ONCE_USER_EMAIL ?? DEMO_USERS.ava;
const user = one<{ id: string }>(db, "SELECT id FROM users WHERE email = ? AND status = 'active'", email);
const profile = user && getOwnProfile(db, user.id);
if (!user || !profile?.onboarded) {
  console.error(`ONCE MCP: no active, onboarded member with email ${email}`);
  process.exit(1);
}

const server = new McpServer(
  { name: "once", title: "ONCE — dates, not chats", version: "1.0.0" },
  { instructions: agentInstructions(profile.firstName) },
);

for (const tool of ONCE_TOOLS as readonly OnceTool[]) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.schema.shape,
      annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, idempotentHint: tool.readOnly, openWorldHint: false },
    },
    async (args: unknown) => {
      const r = executeTool({ ctx, userId: user.id }, tool.name, args);
      return r.ok
        ? { content: [{ type: "text" as const, text: JSON.stringify(r.output, null, 2) }] }
        : { content: [{ type: "text" as const, text: r.error }], isError: true };
    },
  );
}

server.registerPrompt(
  "plan_a_date",
  {
    title: "Plan a date",
    description: "Find a date that fits an idea and suggest who to invite. Doesn't invite anyone without your go-ahead.",
    argsSchema: { idea: z.string().describe("What you're in the mood for, e.g. 'something playful on Saturday under $40'") },
  },
  ({ idea }) => ({
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: `I'd like a date: ${idea}. Find two or three good options and who'd enjoy each, then ask me before inviting anyone.` },
      },
    ],
  }),
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error(`ONCE MCP server ready — acting as ${profile!.firstName} (${email}), db ${defaultDbPath()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
