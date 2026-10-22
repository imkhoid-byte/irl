import crypto from "node:crypto";
import { z } from "zod";
import { id, one, run, type Db } from "../db";
import { addHours, now, nowIso } from "@/lib/time";
import { AppError } from "../errors";
import { rateLimit } from "./ratelimit";
import { audit } from "./audit";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_TTL_HOURS = 24 * 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(actual, expected);
}

// Compared against when an email doesn't exist, so login timing doesn't reveal which emails are registered.
const DUMMY_HASH = hashPassword(crypto.randomUUID());

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export type SessionUser = { id: string; email: string; status: string; onboarded: boolean; isAdmin: boolean; firstName: string | null };

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function createSession(db: Db, userId: string): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = addHours(now(), SESSION_TTL_HOURS);
  run(db, "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", sha256(token), userId, expiresAt.toISOString(), nowIso());
  return { token, expiresAt };
}

export function register(db: Db, input: unknown, ip: string): { userId: string; token: string; expiresAt: Date } {
  rateLimit(db, `register:${ip}`, 10, 60 * 60 * 1000);
  const { email, password } = credentialsSchema.parse(input);
  const exists = one(db, "SELECT 1 FROM users WHERE email = ?", email);
  if (exists) {
    // Deliberately vague: don't confirm which emails have accounts.
    throw new AppError("register_failed", "We couldn't create an account with those details. If you already have one, sign in instead.");
  }
  const userId = id();
  const t = nowIso();
  run(db, "INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", userId, email, hashPassword(password), t, t);
  audit(db, userId, "user.registered", "user", userId);
  return { userId, ...createSession(db, userId) };
}

export function login(db: Db, input: unknown, ip: string): { userId: string; token: string; expiresAt: Date } {
  rateLimit(db, `login:${ip}`, 20, 15 * 60 * 1000);
  const parsed = z.object({ email: z.string().trim().toLowerCase(), password: z.string().max(200) }).safeParse(input);
  const generic = new AppError("login_failed", "That email and password don't match an account.");
  if (!parsed.success) throw generic;
  rateLimit(db, `login-email:${parsed.data.email}`, 10, 15 * 60 * 1000);
  const user = one<{ id: string; password_hash: string; status: string }>(db, "SELECT id, password_hash, status FROM users WHERE email = ?", parsed.data.email);
  const ok = verifyPassword(parsed.data.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw generic;
  if (user.status !== "active") throw new AppError("account_inactive", "This account isn't active. Contact support if you think this is a mistake.");
  return { userId: user.id, ...createSession(db, user.id) };
}

export function logout(db: Db, token: string) {
  run(db, "DELETE FROM sessions WHERE id = ?", sha256(token));
}

export function userFromSession(db: Db, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = one<{ id: string; email: string; status: string; onboarded_at: string | null; expires_at: string; is_admin: number; first_name: string | null }>(
    db,
    `SELECT u.id, u.email, u.status, u.onboarded_at, s.expires_at,
            EXISTS (SELECT 1 FROM admin_roles a WHERE a.user_id = u.id) AS is_admin,
            p.first_name
       FROM sessions s JOIN users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE s.id = ?`,
    sha256(token),
  );
  if (!row || row.expires_at < nowIso() || row.status !== "active") return null;
  return { id: row.id, email: row.email, status: row.status, onboarded: !!row.onboarded_at, isAdmin: !!row.is_admin, firstName: row.first_name };
}

export function isAdmin(db: Db, userId: string): boolean {
  return !!one(db, "SELECT 1 FROM admin_roles WHERE user_id = ? AND role = 'admin'", userId);
}

export function changePassword(db: Db, userId: string, current: string, next: string) {
  const user = one<{ password_hash: string }>(db, "SELECT password_hash FROM users WHERE id = ?", userId);
  if (!user || !verifyPassword(current, user.password_hash)) throw new AppError("invalid", "Your current password is incorrect.");
  const parsed = credentialsSchema.shape.password.safeParse(next);
  if (!parsed.success) throw new AppError("invalid", parsed.error.issues[0].message);
  run(db, "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", hashPassword(next), nowIso(), userId);
  run(db, "DELETE FROM sessions WHERE user_id = ?", userId);
  audit(db, userId, "user.password_changed", "user", userId);
}
