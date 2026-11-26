/**
 * The ONCE agent tool surface — defined once, served two ways:
 *   - over MCP by mcp/server.ts (Claude Desktop, Claude Code, any MCP client)
 *   - as Messages API tools by the eval harness in evals/
 *
 * Every tool calls the same service layer as the web app, so business rules
 * (eligibility, blocking, inventory, the 50/50 split) are enforced identically.
 *
 * Deliberately NOT exposed: committing payment, cancelling, or any way to send
 * a message or contact details. An agent can find and propose dates; only the
 * person can agree to pay, in the app. See README → "Agent safety by design".
 */
import { z } from "zod";
import { ZodError } from "zod";
import type { Ctx } from "@/server/context";
import { AppError } from "@/server/errors";
import { CATEGORIES, CATEGORY_KEYS, INTENTIONS, type Category } from "@/lib/catalog";
import { POLICY } from "@/lib/policy";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatDuration } from "@/lib/time";
import { candidatesForSlot, getOpportunity, isBookable, listOpportunities, type Opportunity } from "@/server/services/discovery";
import { listInvitations, listMatches, sendInvitation } from "@/server/services/dates";
import { getLateRefundPct, getServiceFeeCents } from "@/server/services/settings";

export type ToolContext = { ctx: Ctx; userId: string };

export type OnceTool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  schema: S;
  /** True if the tool only reads. MCP clients use this to skip confirmation prompts. */
  readOnly: boolean;
  run: (tc: ToolContext, input: z.infer<S>) => unknown;
};

const usd = (cents: number) => formatMoney(cents, { showCents: cents % 100 !== 0 });

function summarize(o: Opportunity & { openPeople?: number }) {
  return {
    slot_id: o.slotId,
    title: o.title,
    category: o.category,
    when: formatDateTime(o.startsAt),
    starts_at: o.startsAt,
    duration: formatDuration(o.durationMinutes),
    area: `${o.venueType}, ${o.neighborhood}`,
    distance_km: o.distanceKm,
    indoor: o.indoor,
    price: { total: usd(o.price.totalCents), each: usd(o.price.shareCents), service_fee_each: usd(o.price.feeCents), you_would_pay: usd(o.price.dueCents) },
    ...(o.openPeople !== undefined ? { people_open_to_this: o.openPeople } : {}),
    demo_data: o.isDemo,
  };
}

function define<S extends z.ZodObject>(t: OnceTool<S>): OnceTool<S> {
  return t;
}

const categoryEnum = z.enum(CATEGORY_KEYS as [Category, ...Category[]]);

export const ONCE_TOOLS = [
  define({
    name: "search_dates",
    title: "Search date experiences",
    description:
      "Search bookable date experiences (a specific experience at a specific time). Returns slot ids, times in New York time, " +
      "and the exact per-person price. Use filters to narrow by kind of date, budget, timing, distance or setting. " +
      `Categories: ${CATEGORY_KEYS.map((c) => `${c} (${CATEGORIES[c].label})`).join(", ")}.`,
    schema: z.object({
      category: categoryEnum.optional().describe("Kind of date"),
      max_price_each_usd: z.number().positive().optional().describe("Maximum price of one person's half, in USD, excluding the service fee"),
      when: z.enum(["any", "week", "weekend", "evenings"]).optional().describe("week = next 7 days; weekend = Friday evening to Sunday"),
      max_distance_km: z.number().positive().optional(),
      setting: z.enum(["any", "indoor", "outdoor"]).optional(),
      limit: z.number().int().min(1).max(25).optional().describe("Max results (default 12)"),
    }),
    readOnly: true,
    run: ({ ctx, userId }, i) => {
      const results = listOpportunities(ctx.db, userId, {
        category: i.category ?? "",
        maxBudgetCents: i.max_price_each_usd ? Math.round(i.max_price_each_usd * 100) : undefined,
        when: i.when ?? "any",
        maxDistanceKm: i.max_distance_km,
        setting: i.setting ?? "any",
      });
      return { count: results.length, results: results.slice(0, i.limit ?? 12).map(summarize) };
    },
  }),

  define({
    name: "get_date",
    title: "Get date details",
    description: "Full details for one date slot: what's included, atmosphere, the price breakdown, cancellation deadline and availability. The venue name and address are only revealed once both people have committed.",
    schema: z.object({ slot_id: z.string().describe("slot_id from search_dates") }),
    readOnly: true,
    run: ({ ctx, userId }, i) => {
      const o = getOpportunity(ctx.db, i.slot_id, userId);
      if (!o) throw new AppError("not_found", "No date with that slot_id.");
      return {
        ...summarize(o),
        description: o.description,
        atmosphere: o.atmosphere,
        includes: o.includes,
        dress_code: o.dressCode,
        accessibility: o.accessibility,
        food_and_drink: o.dietary,
        free_cancellation_until: formatDateTime(o.cancellationDeadline),
        tables_left: o.datesLeft,
        bookable_now: o.status === "open" && o.datesLeft > 0 && isBookable(o.startsAt),
      };
    },
  }),

  define({
    name: "suggest_people",
    title: "Suggest people for a date",
    description:
      "Up to six compatible people who would plausibly enjoy this specific date (mutual preferences, budget, distance and availability already applied). " +
      "Returns only public profile fields. Use the user_id with send_invitation.",
    schema: z.object({ slot_id: z.string() }),
    readOnly: true,
    run: ({ ctx, userId }, i) => {
      if (!getOpportunity(ctx.db, i.slot_id)) throw new AppError("not_found", "No date with that slot_id.");
      return {
        people: candidatesForSlot(ctx.db, userId, i.slot_id).map((c) => ({
          user_id: c.userId,
          first_name: c.firstName,
          age: c.age,
          area: c.neighborhood,
          distance_km: c.distanceKm,
          bio: c.bio,
          interests: c.interests,
          looking_for: INTENTIONS[c.intention],
          reliability: c.reliability.label,
          loves_this_kind_of_date: c.likesThisKind,
          shared_interests: c.sharedInterests,
          already_invited: c.invited,
        })),
      };
    },
  }),

  define({
    name: "send_invitation",
    title: "Invite someone to a date",
    description:
      "Invite one person to one specific date slot. Free: nobody is charged. The other person can accept or decline; " +
      "if they accept, BOTH people must confirm the exact details and commit their own half in the ONCE app — this tool cannot do that for anyone. " +
      "There is no message field: ONCE has no chat and never passes along contact details.",
    schema: z.object({ slot_id: z.string(), to_user_id: z.string() }),
    readOnly: false,
    run: ({ ctx, userId }, i) => {
      const invitationId = sendInvitation(ctx.db, userId, { slotId: i.slot_id, toUserId: i.to_user_id });
      const o = getOpportunity(ctx.db, i.slot_id)!;
      return {
        invitation_id: invitationId,
        status: "pending",
        date: `${o.title} · ${formatDateTime(o.startsAt)}`,
        next: "They'll be notified. If they accept, you'll both confirm the details and commit your half in the app. Nothing is charged until both do.",
      };
    },
  }),

  define({
    name: "list_my_dates",
    title: "List my dates and invitations",
    description: "The user's dates (with status: awaiting_commitment, confirmed, completed, cancelled, expired), invitations sent and received, and anything that needs their action, such as a post-date check-in.",
    schema: z.object({}),
    readOnly: true,
    run: ({ ctx, userId }) => ({
      dates: listMatches(ctx.db, userId).map((m) => ({
        date_id: m.id,
        title: m.title,
        with: m.otherName,
        when: formatDateTime(m.startsAt),
        status: m.status,
        needs_your_commitment: m.needsMyCommitment,
        needs_your_check_in: m.needsCheckIn,
      })),
      invitations: listInvitations(ctx.db, userId).map((i) => ({
        invitation_id: i.id,
        direction: i.direction,
        with: i.other.firstName,
        date: `${i.opportunity.title} · ${formatDateTime(i.opportunity.startsAt)}`,
        status: i.status,
      })),
    }),
  }),

  define({
    name: "explain_policy",
    title: "Explain ONCE's payment and cancellation policy",
    description: "The live payment, fee, cancellation, no-show and reliability rules. Use this instead of guessing about money or refunds.",
    schema: z.object({}),
    readOnly: true,
    run: ({ ctx }) => {
      const fee = getServiceFeeCents(ctx.db);
      const late = getLateRefundPct(ctx.db);
      return {
        split: "Each person pays exactly half of the date total. Neither person pays for the other.",
        service_fee: `${usd(fee)} per person, on top of their half.`,
        how_payment_works: "Each person confirms the exact details and places a hold for their half plus the fee. When both holds succeed and the venue is secured, both are charged and the date is confirmed. If either doesn't commit within the window, all holds are released and nobody is charged.",
        commitment_window_hours: POLICY.commitmentWindowHours,
        cancellation: {
          before_both_commit: "No charge for anyone.",
          confirmed_before_deadline: "Full refund for both people, including the fee. The deadline is set per experience (usually 24h before; up to 48h for classes and dinners).",
          after_deadline: `The person who cancels gets ${late}% of their half back; the service fee is not refunded. The other person gets a full refund.`,
          safety_block_venue_or_support: "Full refund for both people.",
          after_start: "Can't be cancelled; report an issue instead.",
        },
        no_shows: "Reported in the private post-date check-in and reviewed by a person. Nothing counts against anyone unless upheld.",
        contact: "ONCE has no chat and never shares phone numbers or social handles.",
      };
    },
  }),
] as const satisfies readonly OnceTool[];

export type ToolName = (typeof ONCE_TOOLS)[number]["name"];

export type ToolOutcome = { ok: true; output: unknown } | { ok: false; error: string };

/** Validate input and run a tool. Business-rule errors come back as tool errors, not exceptions. */
export function executeTool(tc: ToolContext, name: string, rawInput: unknown): ToolOutcome {
  const tool = ONCE_TOOLS.find((t) => t.name === name) as OnceTool | undefined;
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    const input = tool.schema.parse(rawInput ?? {});
    return { ok: true, output: tool.run(tc, input) };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: `Invalid input: ${e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}` };
    if (e instanceof AppError) return { ok: false, error: e.message };
    throw e;
  }
}

/** JSON Schema for each tool's input, for the Messages API `tools` array. */
export function toolJsonSchema(t: OnceTool) {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
  return schema;
}
