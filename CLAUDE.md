# ONCE — notes for Claude Code

ONCE is a commitment-based dating app: no chat; every match is a specific date
both people pay half for. Next.js 16 + TypeScript, SQLite (`node:sqlite`) in demo
mode. See README.md for the product and architecture.

## Where things live
- Business rules: `src/server/services/*` (pure functions taking `db`/`ctx`; no Next.js imports). UI and server actions are thin.
- Agent tool surface: `src/agent/tools.ts` — shared by the MCP server (`mcp/server.ts`) and the eval harness (`evals/`). Agent instructions: `src/agent/instructions.ts`.
- Payments only change through verified webhook events (`services/payments.ts → handlePaymentEvent`). Never set payment status anywhere else.

## Commands
- `npm test` (unit + MCP + eval self-checks), `npm run typecheck`, `npm run lint`
- `npm run test:e2e` (builds, then Playwright on a throwaway DB)
- `npm run eval -- --agent reference|null|eager|claude` (see `evals/run.ts`)
- `npm run mcp` (stdio MCP server, acting as Ava)

## Rules of the road
- Don't add a chat, messaging or contact-exchange feature, and don't add an agent tool that pays, commits, cancels or messages on someone's behalf.
- Money is integer cents; totals must split evenly.
- Changing matching, payments, inventory, cancellation or authorization? Use the `once-change-guard` skill.
- Changing agent tools or instructions, or adding eval cases? Use the `once-eval` skill.
