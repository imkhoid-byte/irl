import { all, id, json, one, run, type Db } from "../db";
import { addDaysYmd, addHours, cityParts, cityTimeToUtc, now, nowIso } from "@/lib/time";
import { DAYS, timeOfDay, type Category, type Intention } from "@/lib/catalog";
import { POLICY, cancellationDeadline } from "@/lib/policy";
import { priceBreakdown, type PriceBreakdown } from "@/lib/money";
import { getServiceFeeCents } from "./settings";
import { distanceKm, getOwnProfile, pairEligibility, roughDistance, toPublic, type OwnProfile, type PublicProfile } from "./profiles";

export const INVENTORY_DAYS = 14;

/**
 * Generate simulated demo inventory from each demo experience's default hours.
 * Idempotent (unique on experience + start). Real venue inventory replaces this.
 */
export function ensureDemoInventory(db: Db, from: Date = now()) {
  const experiences = all<{ id: string; default_hours: string }>(db, "SELECT id, default_hours FROM date_experiences WHERE is_demo = 1 AND active = 1");
  const today = cityParts(from.toISOString()).ymd;
  const t = nowIso();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO availability_slots (id, experience_id, starts_at, capacity, reserved_count, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'open', ?, ?)",
  );
  for (const e of experiences) {
    const hours = json<{ days: number[]; time: string; capacity?: number }[]>(e.default_hours, []);
    for (let d = 0; d <= INVENTORY_DAYS; d++) {
      const ymd = addDaysYmd(today, d);
      const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
      for (const h of hours) {
        if (!h.days.includes(dow)) continue;
        const startsAt = cityTimeToUtc(ymd, h.time);
        if (startsAt <= from) continue;
        insert.run(id(), e.id, startsAt.toISOString(), h.capacity ?? 2, t, t);
      }
    }
  }
}

export type Opportunity = {
  slotId: string;
  experienceId: string;
  slug: string;
  title: string;
  category: Category;
  venueType: string;
  neighborhood: string;
  startsAt: string;
  durationMinutes: number;
  price: PriceBreakdown;
  includes: string[];
  atmosphere: string;
  description: string;
  indoor: boolean;
  cancellationDeadline: string;
  cancellationHours: number;
  datesLeft: number;
  distanceKm: number | null;
  /** Neighbourhood centroid of the venue, used for travel-radius checks. */
  area: { lat: number; lng: number };
  isDemo: boolean;
  dressCode: string;
  accessibility: string;
  dietary: string;
};

type OppRow = {
  slot_id: string;
  experience_id: string;
  slug: string;
  title: string;
  category: Category;
  venue_type: string;
  neighborhood: string;
  n_lat: number;
  n_lng: number;
  starts_at: string;
  duration_minutes: number;
  total_price_cents: number;
  includes: string;
  atmosphere: string;
  description: string;
  indoor: number;
  cancellation_hours: number;
  capacity: number;
  reserved_count: number;
  is_demo: number;
  dress_code: string;
  accessibility_notes: string;
  dietary_options: string;
  status: string;
};

const OPP_SELECT = `
  SELECT s.id AS slot_id, s.starts_at, s.capacity, s.reserved_count, s.status,
         e.id AS experience_id, e.slug, e.title, e.category, e.duration_minutes, e.total_price_cents, e.includes, e.atmosphere,
         e.description, e.indoor, e.cancellation_hours, e.is_demo, e.dress_code,
         v.venue_type, v.accessibility_notes, v.dietary_options, n.name AS neighborhood, n.lat AS n_lat, n.lng AS n_lng
    FROM availability_slots s
    JOIN date_experiences e ON e.id = s.experience_id
    JOIN venues v ON v.id = e.venue_id
    JOIN neighborhoods n ON n.id = v.neighborhood_id`;

function mapOpp(r: OppRow, viewer: { lat: number; lng: number } | null, feeCents: number): Opportunity {
  return {
    slotId: r.slot_id,
    experienceId: r.experience_id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    venueType: r.venue_type,
    neighborhood: r.neighborhood,
    startsAt: r.starts_at,
    durationMinutes: r.duration_minutes,
    price: priceBreakdown(r.total_price_cents, feeCents),
    includes: json<string[]>(r.includes, []),
    atmosphere: r.atmosphere,
    description: r.description,
    indoor: !!r.indoor,
    cancellationDeadline: cancellationDeadline(r.starts_at, r.cancellation_hours).toISOString(),
    cancellationHours: r.cancellation_hours,
    datesLeft: Math.max(0, r.capacity - r.reserved_count),
    distanceKm: viewer ? roughDistance(distanceKm(viewer, { lat: r.n_lat, lng: r.n_lng })) : null,
    area: { lat: r.n_lat, lng: r.n_lng },
    isDemo: !!r.is_demo,
    dressCode: r.dress_code,
    accessibility: r.accessibility_notes,
    dietary: r.dietary_options,
  };
}

export type DiscoveryFilters = {
  maxBudgetCents?: number;
  when?: "any" | "week" | "weekend" | "evenings";
  category?: Category | "";
  maxDistanceKm?: number;
  intention?: Intention | "";
  maxDuration?: number;
  setting?: "any" | "indoor" | "outdoor";
};

export function isBookable(startsAt: string, at: Date = now()) {
  return new Date(startsAt).getTime() - at.getTime() >= POLICY.minLeadHours * 3600_000;
}

export function listOpportunities(db: Db, viewerId: string, f: DiscoveryFilters = {}): (Opportunity & { openPeople: number })[] {
  const viewer = getOwnProfile(db, viewerId);
  const fee = getServiceFeeCents(db);
  const from = addHours(now(), POLICY.minLeadHours).toISOString();
  const to = addHours(now(), INVENTORY_DAYS * 24).toISOString();
  const rows = all<OppRow>(
    db,
    `${OPP_SELECT}
      WHERE s.status = 'open' AND e.active = 1 AND v.active = 1 AND s.reserved_count < s.capacity
        AND s.starts_at >= ? AND s.starts_at <= ?
      ORDER BY s.starts_at`,
    from, to,
  );
  const pool = viewer ? candidatePool(db, viewer) : [];
  return rows
    .map((r) => mapOpp(r, viewer, fee))
    .filter((o) => {
      if (f.maxBudgetCents && o.price.shareCents > f.maxBudgetCents) return false;
      if (f.category && o.category !== f.category) return false;
      if (f.maxDistanceKm && o.distanceKm !== null && o.distanceKm > f.maxDistanceKm) return false;
      if (f.maxDuration && o.durationMinutes > f.maxDuration) return false;
      if (f.setting === "indoor" && !o.indoor) return false;
      if (f.setting === "outdoor" && o.indoor) return false;
      const p = cityParts(o.startsAt);
      if (f.when === "week" && new Date(o.startsAt).getTime() > now().getTime() + 7 * 86400_000) return false;
      if (f.when === "weekend" && ![0, 5, 6].includes(p.dow)) return false;
      if (f.when === "weekend" && p.dow === 5 && p.minutes < 17 * 60) return false;
      if (f.when === "evenings" && p.minutes < 17 * 60) return false;
      return true;
    })
    .map((o) => ({ ...o, openPeople: rankCandidates(pool, o, f.intention || undefined).length }))
    .filter((o) => !f.intention || o.openPeople > 0);
}

export function getOpportunity(db: Db, slotId: string, viewerId?: string): (Opportunity & { status: string }) | null {
  const r = one<OppRow>(db, `${OPP_SELECT} WHERE s.id = ?`, slotId);
  if (!r) return null;
  const viewer = viewerId ? getOwnProfile(db, viewerId) : null;
  return { ...mapOpp(r, viewer, getServiceFeeCents(db)), status: r.status };
}

/** Everyone the viewer could be matched with at all (mutual preferences, not blocked, active). */
export function candidatePool(db: Db, viewer: OwnProfile): OwnProfile[] {
  const ids = all<{ user_id: string }>(
    db,
    `SELECT p.user_id FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE u.status = 'active' AND u.onboarded_at IS NOT NULL AND p.user_id <> ?
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = ?))`,
    viewer.userId, viewer.userId, viewer.userId,
  );
  return ids
    .map((r) => getOwnProfile(db, r.user_id))
    .filter((p): p is OwnProfile => !!p && pairEligibility(db, viewer, p).ok);
}

/** People in the pool who'd plausibly say yes to this specific date: budget, distance, days and times. */
function rankCandidates(pool: OwnProfile[], o: Opportunity, intention?: Intention) {
  const p = cityParts(o.startsAt);
  const day = DAYS[(p.dow + 6) % 7];
  const tod = timeOfDay(p.minutes);
  return pool
    .filter((c) => !intention || c.intention === intention)
    .filter((c) => c.budgetMaxCents >= o.price.shareCents)
    .filter((c) => distanceKm(c, o.area) <= c.travelRadiusKm)
    .map((c) => {
      let score = 0;
      if (c.preferredCategories.includes(o.category)) score += 3;
      if (c.preferredDays.includes(day)) score += 1;
      if (c.preferredTimes.includes(tod)) score += 1;
      return { c, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score);
}

export function busyAt(db: Db, userId: string, startsAt: string, excludeMatchId?: string): boolean {
  // Anyone already holding a date within three hours of this one is unavailable.
  const lo = addHours(startsAt, -3).toISOString();
  const hi = addHours(startsAt, 3).toISOString();
  return !!one(
    db,
    `SELECT 1 FROM matches m JOIN match_participants mp ON mp.match_id = m.id JOIN availability_slots s ON s.id = m.slot_id
      WHERE mp.user_id = ? AND m.status IN ('awaiting_commitment', 'confirmed') AND s.starts_at BETWEEN ? AND ? AND m.id IS NOT ?`,
    userId, lo, hi, excludeMatchId ?? null,
  );
}

export type Candidate = PublicProfile & { sharedInterests: string[]; likesThisKind: boolean; invited: boolean };

/** Suggested people for a specific date. Limited to a handful to discourage browsing. */
export function candidatesForSlot(db: Db, viewerId: string, slotId: string, intention?: Intention): Candidate[] {
  const viewer = getOwnProfile(db, viewerId);
  const opp = getOpportunity(db, slotId, viewerId);
  if (!viewer || !opp) return [];
  const invited = new Set(
    all<{ to_user_id: string }>(db, "SELECT to_user_id FROM date_invitations WHERE slot_id = ? AND from_user_id = ? AND status = 'pending'", slotId, viewerId).map((r) => r.to_user_id),
  );
  return rankCandidates(candidatePool(db, viewer), opp, intention)
    .filter(({ c }) => !busyAt(db, c.userId, opp.startsAt))
    .slice(0, 6)
    .map(({ c }) => ({
      ...toPublic(c, viewer),
      sharedInterests: c.interests.filter((i) => viewer.interests.includes(i)),
      likesThisKind: c.preferredCategories.includes(opp.category),
      invited: invited.has(c.userId),
    }));
}

export function updateSlotStatus(db: Db, slotId: string, status: "open" | "closed") {
  run(db, "UPDATE availability_slots SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), slotId);
}
