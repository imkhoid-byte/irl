import { z } from "zod";
import { all, id, json, one, run, tx, type Db } from "../db";
import { now, nowIso } from "@/lib/time";
import { CATEGORY_KEYS, DAYS, GENDER_KEYS, INTENTION_KEYS, INTERESTS, TIMES, type Category, type Gender, type Intention } from "@/lib/catalog";
import { reliability, type Reliability } from "@/lib/policy";
import { AppError, notFound } from "../errors";
import { audit } from "./audit";
import type { FileStorage } from "../providers/storage";
import type { IdentityProvider } from "../providers/identity";

export function ageFrom(birthDate: string, at: Date = now()): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = at.getUTCFullYear() - y;
  const beforeBirthday = at.getUTCMonth() + 1 < m || (at.getUTCMonth() + 1 === m && at.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

const timeKeys = Object.keys(TIMES) as [string, ...string[]];

export const profileSchema = z
  .object({
    firstName: z.string().trim().min(1, "Add your first name.").max(40).regex(/^[\p{L}' -]+$/u, "Use letters only."),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth."),
    gender: z.enum(GENDER_KEYS as [Gender, ...Gender[]]),
    interestedIn: z.array(z.enum(GENDER_KEYS as [Gender, ...Gender[]])).min(1, "Choose who you'd like to meet."),
    ageMin: z.coerce.number().int().min(18).max(99),
    ageMax: z.coerce.number().int().min(18).max(99),
    bio: z.string().trim().min(20, "Write at least a sentence or two (20+ characters).").max(300),
    interests: z.array(z.enum(INTERESTS)).length(3, "Pick exactly three interests."),
    intention: z.enum(INTENTION_KEYS as [Intention, ...Intention[]]),
    neighborhoodId: z.string().min(1, "Choose your general area."),
    travelRadiusKm: z.coerce.number().int().min(1).max(50),
    preferredCategories: z.array(z.enum(CATEGORY_KEYS as [Category, ...Category[]])).min(1, "Pick at least one kind of date."),
    preferredDays: z.array(z.enum(DAYS)).min(1, "Pick at least one day."),
    preferredTimes: z.array(z.enum(timeKeys)).min(1, "Pick at least one time of day."),
    budgetMaxCents: z.coerce.number().int().min(1000).max(50000),
    dietaryNotes: z.string().trim().max(300).optional().default(""),
    accessibilityNotes: z.string().trim().max(300).optional().default(""),
  })
  .refine((v) => v.ageMax >= v.ageMin, { message: "Maximum age must be at least the minimum.", path: ["ageMax"] })
  .refine((v) => ageFrom(v.birthDate) >= 18, { message: "ONCE is for adults 18 and over.", path: ["birthDate"] })
  .refine((v) => ageFrom(v.birthDate) <= 100, { message: "Check your date of birth.", path: ["birthDate"] });

export const onboardingSchema = profileSchema.and(
  z.object({
    confirmAdult: z.literal(true, { error: "You must confirm you're 18 or older." }),
    acceptGuidelines: z.literal(true, { error: "Please agree to the community guidelines." }),
  }),
);

export type ProfileInput = z.infer<typeof profileSchema>;

function validateNeighborhood(db: Db, neighborhoodId: string) {
  if (!one(db, "SELECT 1 FROM neighborhoods WHERE id = ?", neighborhoodId)) throw new AppError("invalid", "Choose your general area from the list.");
}

export function completeOnboarding(db: Db, userId: string, input: unknown) {
  const v = onboardingSchema.parse(input);
  validateNeighborhood(db, v.neighborhoodId);
  const t = nowIso();
  tx(db, () => {
    run(
      db,
      `INSERT INTO profiles (user_id, first_name, birth_date, gender, interested_in, age_min, age_max, bio, interests, intention, neighborhood_id, guidelines_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET first_name = excluded.first_name, birth_date = excluded.birth_date, gender = excluded.gender,
         interested_in = excluded.interested_in, age_min = excluded.age_min, age_max = excluded.age_max, bio = excluded.bio,
         interests = excluded.interests, intention = excluded.intention, neighborhood_id = excluded.neighborhood_id,
         guidelines_accepted_at = excluded.guidelines_accepted_at, updated_at = excluded.updated_at`,
      userId, v.firstName, v.birthDate, v.gender, JSON.stringify(v.interestedIn), v.ageMin, v.ageMax, v.bio, JSON.stringify(v.interests), v.intention, v.neighborhoodId, t, t, t,
    );
    savePreferences(db, userId, v);
    run(db, "UPDATE users SET onboarded_at = COALESCE(onboarded_at, ?), updated_at = ? WHERE id = ?", t, t, userId);
    audit(db, userId, "profile.onboarded", "user", userId);
  });
}

function savePreferences(db: Db, userId: string, v: ProfileInput) {
  run(
    db,
    `INSERT INTO user_preferences (user_id, preferred_categories, preferred_days, preferred_times, budget_max_cents, travel_radius_km, dietary_notes, accessibility_notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET preferred_categories = excluded.preferred_categories, preferred_days = excluded.preferred_days,
       preferred_times = excluded.preferred_times, budget_max_cents = excluded.budget_max_cents, travel_radius_km = excluded.travel_radius_km,
       dietary_notes = excluded.dietary_notes, accessibility_notes = excluded.accessibility_notes, updated_at = excluded.updated_at`,
    userId, JSON.stringify(v.preferredCategories), JSON.stringify(v.preferredDays), JSON.stringify(v.preferredTimes), v.budgetMaxCents, v.travelRadiusKm,
    v.dietaryNotes || null, v.accessibilityNotes || null, nowIso(),
  );
}

export function updateProfile(db: Db, userId: string, input: unknown) {
  const v = profileSchema.parse(input);
  validateNeighborhood(db, v.neighborhoodId);
  tx(db, () => {
    const r = run(
      db,
      `UPDATE profiles SET first_name = ?, birth_date = ?, gender = ?, interested_in = ?, age_min = ?, age_max = ?, bio = ?, interests = ?, intention = ?, neighborhood_id = ?, updated_at = ? WHERE user_id = ?`,
      v.firstName, v.birthDate, v.gender, JSON.stringify(v.interestedIn), v.ageMin, v.ageMax, v.bio, JSON.stringify(v.interests), v.intention, v.neighborhoodId, nowIso(), userId,
    );
    if (r.changes !== 1) throw notFound("your profile");
    savePreferences(db, userId, v);
  });
}

type ProfileRow = {
  user_id: string;
  first_name: string;
  birth_date: string;
  gender: Gender;
  interested_in: string;
  age_min: number;
  age_max: number;
  bio: string;
  interests: string;
  intention: Intention;
  neighborhood_id: string;
  neighborhood: string;
  lat: number;
  lng: number;
  verification_status: string;
  verification_is_test: number;
  preferred_categories: string | null;
  preferred_days: string | null;
  preferred_times: string | null;
  budget_max_cents: number | null;
  travel_radius_km: number | null;
  dietary_notes: string | null;
  accessibility_notes: string | null;
  email_notifications: number | null;
  status: string;
  onboarded_at: string | null;
};

const PROFILE_SELECT = `
  SELECT p.*, n.name AS neighborhood, n.lat, n.lng,
         up.preferred_categories, up.preferred_days, up.preferred_times, up.budget_max_cents, up.travel_radius_km,
         up.dietary_notes, up.accessibility_notes, up.email_notifications,
         u.status, u.onboarded_at
    FROM profiles p
    JOIN users u ON u.id = p.user_id
    JOIN neighborhoods n ON n.id = p.neighborhood_id
    LEFT JOIN user_preferences up ON up.user_id = p.user_id`;

export type OwnProfile = ReturnType<typeof mapOwn>;

function mapOwn(r: ProfileRow, photos: string[], rel: Reliability) {
  return {
    userId: r.user_id,
    firstName: r.first_name,
    birthDate: r.birth_date,
    age: ageFrom(r.birth_date),
    gender: r.gender,
    interestedIn: json<Gender[]>(r.interested_in, []),
    ageMin: r.age_min,
    ageMax: r.age_max,
    bio: r.bio,
    interests: json<string[]>(r.interests, []),
    intention: r.intention,
    neighborhoodId: r.neighborhood_id,
    neighborhood: r.neighborhood,
    lat: r.lat,
    lng: r.lng,
    verificationStatus: r.verification_status,
    verificationIsTest: !!r.verification_is_test,
    preferredCategories: json<Category[]>(r.preferred_categories, []),
    preferredDays: json<string[]>(r.preferred_days, []),
    preferredTimes: json<string[]>(r.preferred_times, []),
    budgetMaxCents: r.budget_max_cents ?? 5000,
    travelRadiusKm: r.travel_radius_km ?? 8,
    dietaryNotes: r.dietary_notes ?? "",
    accessibilityNotes: r.accessibility_notes ?? "",
    emailNotifications: r.email_notifications !== 0,
    status: r.status,
    onboarded: !!r.onboarded_at,
    photoIds: photos,
    reliability: rel,
  };
}

export function photoIdsFor(db: Db, userId: string): string[] {
  return all<{ id: string }>(db, "SELECT id FROM profile_photos WHERE user_id = ? ORDER BY position", userId).map((p) => p.id);
}

export function reliabilityFor(db: Db, userId: string): Reliability {
  // Attendance counts only when the OTHER participant confirmed this person was there.
  const attended =
    one<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM matches m
         JOIN match_participants me ON me.match_id = m.id AND me.user_id = ?
         JOIN attendance_confirmations ac ON ac.match_id = m.id AND ac.user_id <> me.user_id AND ac.other_attended = 1
        WHERE m.status = 'completed'`,
      userId,
    )?.n ?? 0;
  // A no-show counts only after review upholds it — never on one person's word.
  const upheldNoShows = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM reports WHERE reported_user_id = ? AND kind = 'no_show' AND status = 'upheld'", userId)?.n ?? 0;
  return reliability({ attended, upheldNoShows });
}

export function getOwnProfile(db: Db, userId: string) {
  const r = one<ProfileRow>(db, `${PROFILE_SELECT} WHERE p.user_id = ?`, userId);
  if (!r) return null;
  return mapOwn(r, photoIdsFor(db, userId), reliabilityFor(db, userId));
}

export type PublicProfile = {
  userId: string;
  firstName: string;
  age: number;
  neighborhood: string;
  distanceKm: number | null;
  bio: string;
  interests: string[];
  intention: Intention;
  preferredCategories: Category[];
  reliability: Reliability;
  verified: boolean;
  verificationIsTest: boolean;
  photoIds: string[];
};

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Coarse, centroid-to-centroid distance. Never derived from a precise location. */
export function roughDistance(km: number): number {
  return km < 1 ? 1 : Math.round(km);
}

/** What another member may see. No email, birth date, preferences, dietary needs or payment data. */
export function toPublic(p: OwnProfile, viewer?: { lat: number; lng: number } | null): PublicProfile {
  return {
    userId: p.userId,
    firstName: p.firstName,
    age: p.age,
    neighborhood: p.neighborhood,
    distanceKm: viewer ? roughDistance(distanceKm(viewer, p)) : null,
    bio: p.bio,
    interests: p.interests.slice(0, 3),
    intention: p.intention,
    preferredCategories: p.preferredCategories,
    reliability: p.reliability,
    verified: p.verificationStatus === "verified",
    verificationIsTest: p.verificationIsTest,
    photoIds: p.photoIds,
  };
}

export function isBlockedEitherWay(db: Db, a: string, b: string): boolean {
  return !!one(db, "SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a);
}

/** Have these two people been connected through an invitation or a date? Gates profile viewing. */
export function haveConnection(db: Db, a: string, b: string): boolean {
  return !!one(
    db,
    `SELECT 1 FROM date_invitations WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?) LIMIT 1`,
    a, b, b, a,
  );
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/** Can these two people be matched at all? Applied to every invitation, server-side. */
export function pairEligibility(db: Db, a: OwnProfile | null, b: OwnProfile | null, opts: { repeat?: boolean } = {}): Eligibility {
  if (!a || !b) return { ok: false, reason: "That person isn't available." };
  if (a.userId === b.userId) return { ok: false, reason: "You can't match with yourself." };
  if (a.status !== "active" || b.status !== "active" || !a.onboarded || !b.onboarded) return { ok: false, reason: "That person isn't available." };
  if (isBlockedEitherWay(db, a.userId, b.userId)) return { ok: false, reason: "That person isn't available." };
  if (opts.repeat) return { ok: true };
  const genders = a.interestedIn.includes(b.gender) && b.interestedIn.includes(a.gender);
  const ages = b.age >= a.ageMin && b.age <= a.ageMax && a.age >= b.ageMin && a.age <= b.ageMax;
  if (!genders || !ages) return { ok: false, reason: "That person isn't available." };
  return { ok: true };
}

export function listNeighborhoods(db: Db) {
  return all<{ id: string; name: string; city: string }>(db, "SELECT id, name, city FROM neighborhoods ORDER BY name");
}

const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function addPhoto(db: Db, storage: FileStorage, userId: string, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new AppError("invalid", "Choose a photo to upload.");
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new AppError("invalid", "Photos must be 5 MB or smaller.");
  // Trust the file's bytes, not its name or the browser-supplied type.
  const mime = sniffMime(bytes);
  if (!mime) throw new AppError("invalid", "Upload a JPG, PNG or WebP image.");
  const existing = all<{ position: number }>(db, "SELECT position FROM profile_photos WHERE user_id = ? ORDER BY position", userId);
  if (existing.length >= MAX_PHOTOS) throw new AppError("invalid", `You can have up to ${MAX_PHOTOS} photos.`);
  const photoId = id();
  const key = `${photoId}.${MIME_EXT[mime]}`;
  await storage.put(key, bytes);
  const position = existing.length ? existing[existing.length - 1].position + 1 : 0;
  run(db, "INSERT INTO profile_photos (id, user_id, storage_key, mime_type, position, created_at) VALUES (?, ?, ?, ?, ?, ?)", photoId, userId, key, mime, position, nowIso());
  return photoId;
}

export async function removePhoto(db: Db, storage: FileStorage, userId: string, photoId: string) {
  const photo = one<{ storage_key: string }>(db, "SELECT storage_key FROM profile_photos WHERE id = ? AND user_id = ?", photoId, userId);
  if (!photo) throw notFound("that photo");
  run(db, "DELETE FROM profile_photos WHERE id = ?", photoId);
  await storage.remove(photo.storage_key);
}

export function getPhoto(db: Db, photoId: string) {
  return one<{ storage_key: string; mime_type: string; user_id: string }>(db, "SELECT storage_key, mime_type, user_id FROM profile_photos WHERE id = ?", photoId);
}

export async function startVerification(db: Db, identity: IdentityProvider, userId: string) {
  const res = await identity.start(userId);
  run(db, "UPDATE profiles SET verification_status = ?, verification_ref = ?, verification_is_test = ?, updated_at = ? WHERE user_id = ?", res.status, res.ref, identity.isTest ? 1 : 0, nowIso(), userId);
  audit(db, userId, "identity.verification_started", "user", userId, { provider: identity.name, status: res.status, test: identity.isTest });
  return res.status;
}

export function setEmailNotifications(db: Db, userId: string, enabled: boolean) {
  run(db, "UPDATE user_preferences SET email_notifications = ?, updated_at = ? WHERE user_id = ?", enabled ? 1 : 0, nowIso(), userId);
}

/** Deactivate and scrub an account. Refused while a paid date is upcoming, so nobody is left stranded. */
export function deleteAccount(db: Db, userId: string) {
  tx(db, () => {
    const upcoming = one(
      db,
      `SELECT 1 FROM matches m JOIN match_participants mp ON mp.match_id = m.id
        WHERE mp.user_id = ? AND m.status IN ('awaiting_commitment', 'confirmed')`,
      userId,
    );
    if (upcoming) throw new AppError("has_upcoming", "Cancel your upcoming dates first, so the other person isn't left waiting.");
    run(db, "UPDATE date_invitations SET status = 'withdrawn', updated_at = ? WHERE status = 'pending' AND (from_user_id = ? OR to_user_id = ?)", nowIso(), userId, userId);
    run(db, "UPDATE users SET status = 'deleted', email = ?, updated_at = ? WHERE id = ?", `deleted-${userId}@invalid`, nowIso(), userId);
    run(db, "UPDATE profiles SET bio = '', first_name = 'Former member' WHERE user_id = ?", userId);
    run(db, "UPDATE user_preferences SET dietary_notes = NULL, accessibility_notes = NULL WHERE user_id = ?", userId);
    run(db, "DELETE FROM sessions WHERE user_id = ?", userId);
    audit(db, userId, "user.deleted", "user", userId);
  });
}
