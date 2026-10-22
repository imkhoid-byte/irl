import { z } from "zod";
import { all, id, one, run, tx, type Db } from "../db";
import type { Ctx } from "../context";
import { nowIso } from "@/lib/time";
import { CATEGORY_KEYS, type Category } from "@/lib/catalog";
import { AppError } from "../errors";
import { audit } from "./audit";
import { notify } from "./notifications";
import { cancelMatch } from "./lifecycle";
import { refundIntent } from "./payments";
import { latestIntent } from "./dates";
import { ageFrom } from "./profiles";

/** Every admin service call re-checks the role in the database. Never trust a client flag. */
export function assertAdmin(db: Db, userId: string) {
  if (!one(db, "SELECT 1 FROM admin_roles WHERE user_id = ? AND role = 'admin'", userId)) throw new AppError("forbidden", "Not found.", 404);
}

// ---------------------------------------------------------------------------
// Analytics — outcomes, not engagement.
// ---------------------------------------------------------------------------

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

export function analytics(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  const c = (sql: string, ...p: string[]) => one<{ n: number }>(db, sql, ...p)?.n ?? 0;
  const invitations = c("SELECT COUNT(*) AS n FROM date_invitations WHERE status <> 'pending'");
  const accepted = c("SELECT COUNT(*) AS n FROM date_invitations WHERE status = 'accepted'");
  const matches = c("SELECT COUNT(*) AS n FROM matches WHERE status <> 'awaiting_commitment'");
  const confirmedEver = c("SELECT COUNT(*) AS n FROM matches WHERE confirmed_at IS NOT NULL");
  const intents = c("SELECT COUNT(*) AS n FROM payment_intents WHERE status <> 'processing'");
  const paid = c("SELECT COUNT(*) AS n FROM payment_intents WHERE status IN ('authorized', 'captured', 'refunded', 'partially_refunded') OR (status = 'canceled' AND failure_reason IS NULL)");
  const completed = c("SELECT COUNT(*) AS n FROM matches WHERE status = 'completed'");
  const attendanceRows = c("SELECT COUNT(*) AS n FROM attendance_confirmations");
  const attendedRows = c("SELECT COUNT(*) AS n FROM attendance_confirmations WHERE other_attended = 1");
  const cancelledAfterConfirm = c("SELECT COUNT(*) AS n FROM matches WHERE status = 'cancelled' AND confirmed_at IS NOT NULL");
  const noShowsUpheld = c("SELECT COUNT(*) AS n FROM reports WHERE kind = 'no_show' AND status = 'upheld'");
  const bothFeedback = c("SELECT COUNT(*) AS n FROM (SELECT match_id FROM post_date_feedback GROUP BY match_id HAVING COUNT(*) = 2)");
  const mutual = c("SELECT COUNT(*) AS n FROM (SELECT match_id FROM post_date_feedback GROUP BY match_id HAVING COUNT(*) = 2 AND SUM(open_to_another) = 2)");
  const captured = c("SELECT COUNT(*) AS n FROM payment_intents WHERE status IN ('captured', 'refunded', 'partially_refunded')");
  const refunded = c("SELECT COUNT(*) AS n FROM payment_intents WHERE status IN ('refunded', 'partially_refunded')");
  const disputes = c("SELECT COUNT(*) AS n FROM reports WHERE kind = 'no_show'");
  const avg = (col: string) => one<{ a: number | null }>(db, `SELECT AVG(${col}) AS a FROM post_date_feedback`)?.a ?? null;
  const timeToFirst = one<{ h: number | null }>(
    db,
    `SELECT AVG((julianday(first) - julianday(u.created_at)) * 24) AS h FROM users u
       JOIN (SELECT mp.user_id, MIN(m.confirmed_at) AS first FROM matches m JOIN match_participants mp ON mp.match_id = m.id WHERE m.confirmed_at IS NOT NULL GROUP BY mp.user_id) f ON f.user_id = u.id`,
  )?.h ?? null;
  return {
    invitationAcceptance: pct(accepted, invitations),
    acceptedToConfirmed: pct(confirmedEver, matches),
    paymentCompletion: pct(paid, intents),
    attendance: pct(attendedRows, attendanceRows),
    cancellationRate: pct(cancelledAfterConfirm, confirmedEver),
    noShowRate: pct(noShowsUpheld, attendanceRows),
    mutualInterest: pct(mutual, bothFeedback),
    refundRate: pct(refunded, captured),
    disputeRate: pct(disputes, completed),
    hoursToFirstDate: timeToFirst === null ? null : Math.round(timeToFirst),
    experienceSatisfaction: avg("experience_rating"),
    venueSatisfaction: avg("venue_rating"),
    totals: {
      users: c("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
      confirmedUpcoming: c("SELECT COUNT(*) AS n FROM matches WHERE status = 'confirmed'"),
      completed,
      openReports: c("SELECT COUNT(*) AS n FROM reports WHERE status IN ('open', 'reviewing')"),
    },
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function listUsers(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; email: string; status: string; is_demo: number; created_at: string; first_name: string | null; birth_date: string | null; verification_status: string | null; is_admin: number; reports: number }>(
    db,
    `SELECT u.id, u.email, u.status, u.is_demo, u.created_at, p.first_name, p.birth_date, p.verification_status,
            EXISTS (SELECT 1 FROM admin_roles a WHERE a.user_id = u.id) AS is_admin,
            (SELECT COUNT(*) FROM reports r WHERE r.reported_user_id = u.id) AS reports
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id ORDER BY u.created_at DESC`,
  ).map((u) => ({ ...u, age: u.birth_date ? ageFrom(u.birth_date) : null }));
}

export function setUserStatus(db: Db, adminId: string, userId: string, status: "active" | "suspended") {
  assertAdmin(db, adminId);
  if (userId === adminId) throw new AppError("invalid", "You can't change your own status.");
  tx(db, () => {
    run(db, "UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND status <> 'deleted'", status, nowIso(), userId);
    if (status === "suspended") {
      run(db, "DELETE FROM sessions WHERE user_id = ?", userId);
      run(db, "UPDATE date_invitations SET status = 'cancelled', updated_at = ? WHERE status = 'pending' AND (from_user_id = ? OR to_user_id = ?)", nowIso(), userId, userId);
    }
    audit(db, adminId, `user.${status}`, "user", userId);
  });
}

// ---------------------------------------------------------------------------
// Catalog: venues, experiences, slots
// ---------------------------------------------------------------------------

export const venueSchema = z.object({
  name: z.string().trim().min(2).max(80),
  venueType: z.string().trim().min(2).max(60),
  neighborhoodId: z.string().min(1),
  address: z.string().trim().min(5).max(160),
  accessibilityNotes: z.string().trim().max(300).default(""),
  dietaryOptions: z.string().trim().max(300).default(""),
});

export function listVenues(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; name: string; venue_type: string; address: string; neighborhood: string; active: number; is_demo: number }>(
    db,
    "SELECT v.id, v.name, v.venue_type, v.address, n.name AS neighborhood, v.active, v.is_demo FROM venues v JOIN neighborhoods n ON n.id = v.neighborhood_id ORDER BY v.name",
  );
}

export function createVenue(db: Db, adminId: string, input: unknown) {
  assertAdmin(db, adminId);
  const v = venueSchema.parse(input);
  if (!one(db, "SELECT 1 FROM neighborhoods WHERE id = ?", v.neighborhoodId)) throw new AppError("invalid", "Unknown neighbourhood.");
  const venueId = id();
  const t = nowIso();
  run(db, "INSERT INTO venues (id, name, venue_type, neighborhood_id, address, accessibility_notes, dietary_options, is_demo, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)", venueId, v.name, v.venueType, v.neighborhoodId, v.address, v.accessibilityNotes, v.dietaryOptions, t, t);
  audit(db, adminId, "venue.created", "venue", venueId, { name: v.name });
  return venueId;
}

export function toggleVenue(db: Db, adminId: string, venueId: string) {
  assertAdmin(db, adminId);
  run(db, "UPDATE venues SET active = 1 - active, updated_at = ? WHERE id = ?", nowIso(), venueId);
  audit(db, adminId, "venue.toggled", "venue", venueId);
}

export const experienceSchema = z.object({
  title: z.string().trim().min(3).max(80),
  category: z.enum(CATEGORY_KEYS as [Category, ...Category[]]),
  venueId: z.string().min(1),
  description: z.string().trim().min(10).max(600),
  atmosphere: z.string().trim().min(3).max(200),
  includes: z.string().trim().max(400).default(""),
  durationMinutes: z.coerce.number().int().min(30).max(360),
  totalPriceDollars: z.coerce.number().positive().max(1000),
  indoor: z.coerce.boolean().default(true),
  cancellationHours: z.coerce.number().int().min(1).max(168),
  dressCode: z.string().trim().max(200).default(""),
  arrivalNotes: z.string().trim().max(300).default(""),
});

export function listExperiences(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; title: string; category: string; venue: string; total_price_cents: number; duration_minutes: number; active: number; is_demo: number; open_slots: number; reserved: number }>(
    db,
    `SELECT e.id, e.title, e.category, v.name AS venue, e.total_price_cents, e.duration_minutes, e.active, e.is_demo,
            (SELECT COUNT(*) FROM availability_slots s WHERE s.experience_id = e.id AND s.status = 'open' AND s.starts_at > ?) AS open_slots,
            (SELECT COALESCE(SUM(reserved_count), 0) FROM availability_slots s WHERE s.experience_id = e.id AND s.starts_at > ?) AS reserved
       FROM date_experiences e JOIN venues v ON v.id = e.venue_id ORDER BY e.title`,
    nowIso(), nowIso(),
  );
}

export function createExperience(db: Db, adminId: string, input: unknown) {
  assertAdmin(db, adminId);
  const v = experienceSchema.parse(input);
  const totalCents = Math.round(v.totalPriceDollars * 100);
  if (totalCents % 2 !== 0) throw new AppError("invalid", "The total must split evenly between two people (use an even number of cents).");
  if (!one(db, "SELECT 1 FROM venues WHERE id = ?", v.venueId)) throw new AppError("invalid", "Unknown venue.");
  const expId = id();
  const t = nowIso();
  const slug = `${v.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${expId.slice(0, 6)}`;
  const includes = v.includes.split("\n").map((s) => s.trim()).filter(Boolean);
  run(
    db,
    `INSERT INTO date_experiences (id, slug, title, category, venue_id, description, atmosphere, includes, duration_minutes, total_price_cents, indoor, dress_code, arrival_notes, cancellation_hours, default_hours, is_demo, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 1, 1, ?, ?)`,
    expId, slug, v.title, v.category, v.venueId, v.description, v.atmosphere, JSON.stringify(includes), v.durationMinutes, totalCents, v.indoor ? 1 : 0, v.dressCode, v.arrivalNotes, v.cancellationHours, t, t,
  );
  audit(db, adminId, "experience.created", "date_experience", expId, { title: v.title, totalCents });
  return expId;
}

export function toggleExperience(db: Db, adminId: string, experienceId: string) {
  assertAdmin(db, adminId);
  run(db, "UPDATE date_experiences SET active = 1 - active, updated_at = ? WHERE id = ?", nowIso(), experienceId);
  audit(db, adminId, "experience.toggled", "date_experience", experienceId);
}

export function addSlot(db: Db, adminId: string, experienceId: string, startsAtIso: string, capacity: number) {
  assertAdmin(db, adminId);
  const start = new Date(startsAtIso);
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) throw new AppError("invalid", "Choose a time in the future.");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) throw new AppError("invalid", "Capacity must be 1–20 dates.");
  const slotId = id();
  const t = nowIso();
  try {
    run(db, "INSERT INTO availability_slots (id, experience_id, starts_at, capacity, reserved_count, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'open', ?, ?)", slotId, experienceId, start.toISOString(), capacity, t, t);
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new AppError("duplicate", "That experience already has a slot at this time.");
    throw e;
  }
  audit(db, adminId, "slot.created", "availability_slot", slotId, { experienceId, startsAt: start.toISOString(), capacity });
}

export function listSlots(db: Db, adminId: string, experienceId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; starts_at: string; capacity: number; reserved_count: number; status: string }>(
    db,
    "SELECT id, starts_at, capacity, reserved_count, status FROM availability_slots WHERE experience_id = ? AND starts_at > ? ORDER BY starts_at LIMIT 40",
    experienceId, nowIso(),
  );
}

export function setSlotStatus(db: Db, adminId: string, slotId: string, status: "open" | "closed") {
  assertAdmin(db, adminId);
  run(db, "UPDATE availability_slots SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), slotId);
  audit(db, adminId, `slot.${status}`, "availability_slot", slotId);
}

// ---------------------------------------------------------------------------
// Dates, reservations & payments
// ---------------------------------------------------------------------------

export function listMatchesAdmin(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; status: string; title: string; starts_at: string; names: string; reservation_status: string | null; confirmation_code: string | null; total_price_cents: number; is_test: number; created_at: string }>(
    db,
    `SELECT m.id, m.status, e.title, s.starts_at, m.total_price_cents, m.is_test, m.created_at,
            (SELECT GROUP_CONCAT(p.first_name, ' & ') FROM match_participants mp JOIN profiles p ON p.user_id = mp.user_id WHERE mp.match_id = m.id) AS names,
            r.status AS reservation_status, r.confirmation_code
       FROM matches m JOIN date_experiences e ON e.id = m.experience_id JOIN availability_slots s ON s.id = m.slot_id
       LEFT JOIN reservations r ON r.match_id = m.id
      ORDER BY m.created_at DESC LIMIT 200`,
  );
}

export function listPayments(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; match_id: string; email: string; amount_cents: number; share_cents: number; fee_cents: number; status: string; refunded_cents: number; failure_reason: string | null; provider: string; provider_ref: string | null; is_test: number; created_at: string }>(
    db,
    `SELECT pi.id, pi.match_id, u.email, pi.amount_cents, pi.share_cents, pi.fee_cents, pi.status, pi.refunded_cents, pi.failure_reason, pi.provider, pi.provider_ref, pi.is_test, pi.created_at
       FROM payment_intents pi JOIN users u ON u.id = pi.user_id ORDER BY pi.created_at DESC LIMIT 200`,
  );
}

export function listLedger(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; payment_intent_id: string; kind: string; amount_cents: number; provider_event_id: string; is_test: number; created_at: string }>(
    db,
    "SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 200",
  );
}

export async function adminRefund(ctx: Ctx, adminId: string, intentId: string, amountCents: number, note: string) {
  assertAdmin(ctx.db, adminId);
  await refundIntent(ctx, intentId, amountCents, `admin-${Date.now()}`);
  audit(ctx.db, adminId, "payment.refunded_by_admin", "payment_intent", intentId, { amountCents, note });
}

export async function adminCancelMatch(ctx: Ctx, adminId: string, matchId: string) {
  assertAdmin(ctx.db, adminId);
  await cancelMatch(ctx, adminId, matchId, { kind: "platform", reason: "cancelled_by_support" });
}

// ---------------------------------------------------------------------------
// Reports & disputes
// ---------------------------------------------------------------------------

export function listReports(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; kind: string; status: string; details: string; created_at: string; reporter: string; reported: string | null; reported_user_id: string | null; match_id: string | null; resolution_note: string | null }>(
    db,
    `SELECT r.id, r.kind, r.status, r.details, r.created_at, r.match_id, r.reported_user_id, r.resolution_note,
            COALESCE(rp.first_name, ru.email) AS reporter, dp.first_name AS reported
       FROM reports r JOIN users ru ON ru.id = r.reporter_id LEFT JOIN profiles rp ON rp.user_id = r.reporter_id
       LEFT JOIN profiles dp ON dp.user_id = r.reported_user_id
      ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at DESC`,
  );
}

/**
 * Resolve a report. Upholding a no-show is the only way attendance counts
 * against someone, and it can refund the person who was stood up.
 */
export async function resolveReport(ctx: Ctx, adminId: string, reportId: string, decision: "upheld" | "dismissed" | "resolved" | "reviewing", note: string, refundReporter = false) {
  const { db } = ctx;
  assertAdmin(db, adminId);
  const report = one<{ id: string; kind: string; reporter_id: string; match_id: string | null; status: string }>(db, "SELECT * FROM reports WHERE id = ?", reportId);
  if (!report) throw new AppError("not_found", "Report not found.", 404);
  run(db, "UPDATE reports SET status = ?, resolution_note = ?, resolved_by = ?, updated_at = ? WHERE id = ?", decision, note.slice(0, 1000) || null, adminId, nowIso(), reportId);
  audit(db, adminId, `report.${decision}`, "report", reportId, { refundReporter });
  if (decision === "upheld" && refundReporter && report.match_id) {
    const intent = latestIntent(db, report.match_id, report.reporter_id);
    if (intent && ["captured", "partially_refunded"].includes(intent.status)) {
      await refundIntent(ctx, intent.id, intent.share_cents - Math.min(intent.share_cents, intent.refunded_cents), `noshow-${reportId}`);
    }
  }
  if (decision !== "reviewing") {
    notify(db, report.reporter_id, { kind: "report_update", title: "Update on your report", body: "Our team has reviewed what you told us. Thank you for helping keep ONCE safe.", link: "/my-dates", dedupeKey: `report:${reportId}:${decision}` });
  }
}

export function listAudit(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; actor: string | null; action: string; entity_type: string; entity_id: string | null; metadata: string; created_at: string }>(
    db,
    "SELECT a.id, COALESCE(u.email, 'system') AS actor, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC, a.rowid DESC LIMIT 300",
  );
}

export function listOutbox(db: Db, adminId: string) {
  assertAdmin(db, adminId);
  return all<{ id: string; email: string; subject: string; body: string; created_at: string }>(
    db,
    "SELECT o.id, u.email, o.subject, o.body, o.created_at FROM outbound_emails o JOIN users u ON u.id = o.to_user_id ORDER BY o.created_at DESC, o.rowid DESC LIMIT 100",
  );
}
