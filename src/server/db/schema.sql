-- ONCE demo-mode schema (SQLite).
-- The production Postgres/Supabase equivalent, with row-level security,
-- lives in supabase/migrations/0001_init.sql. Keep the two in sync.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  is_demo       INTEGER NOT NULL DEFAULT 0,
  onboarded_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY, -- sha256 of the opaque cookie token; the raw token is never stored
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- Neighbourhood centroids only. ONCE never stores a precise home location.
CREATE TABLE IF NOT EXISTS neighborhoods (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  lat  REAL NOT NULL,
  lng  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name             TEXT NOT NULL,
  birth_date             TEXT NOT NULL,
  gender                 TEXT NOT NULL CHECK (gender IN ('woman', 'man', 'nonbinary')),
  interested_in          TEXT NOT NULL DEFAULT '[]', -- JSON array of genders
  age_min                INTEGER NOT NULL DEFAULT 18 CHECK (age_min >= 18),
  age_max                INTEGER NOT NULL DEFAULT 99 CHECK (age_max >= age_min),
  bio                    TEXT NOT NULL DEFAULT '',
  interests              TEXT NOT NULL DEFAULT '[]', -- JSON array, max 3 shown publicly
  intention              TEXT NOT NULL CHECK (intention IN ('long_term', 'open_to_long_term', 'see_where_it_goes', 'something_casual')),
  neighborhood_id        TEXT NOT NULL REFERENCES neighborhoods(id),
  verification_status    TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'failed')),
  verification_is_test   INTEGER NOT NULL DEFAULT 0,
  verification_ref       TEXT,
  guidelines_accepted_at TEXT NOT NULL,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS profiles_neighborhood_idx ON profiles(neighborhood_id);

CREATE TABLE IF NOT EXISTS profile_photos (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (user_id, position)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_categories TEXT NOT NULL DEFAULT '[]',
  preferred_days       TEXT NOT NULL DEFAULT '[]',
  preferred_times      TEXT NOT NULL DEFAULT '[]',
  budget_max_cents     INTEGER NOT NULL DEFAULT 5000 CHECK (budget_max_cents > 0),
  travel_radius_km     INTEGER NOT NULL DEFAULT 8 CHECK (travel_radius_km BETWEEN 1 AND 100),
  -- Private. Shared only with the venue for a confirmed reservation, never with the other participant.
  dietary_notes        TEXT,
  accessibility_notes  TEXT,
  email_notifications  INTEGER NOT NULL DEFAULT 1,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS venues (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  venue_type          TEXT NOT NULL,
  neighborhood_id     TEXT NOT NULL REFERENCES neighborhoods(id),
  address             TEXT NOT NULL,
  accessibility_notes TEXT NOT NULL DEFAULT '',
  dietary_options     TEXT NOT NULL DEFAULT '',
  is_demo             INTEGER NOT NULL DEFAULT 1,
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS date_experiences (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  category           TEXT NOT NULL,
  venue_id           TEXT NOT NULL REFERENCES venues(id),
  description        TEXT NOT NULL,
  atmosphere         TEXT NOT NULL,
  includes           TEXT NOT NULL DEFAULT '[]',
  duration_minutes   INTEGER NOT NULL CHECK (duration_minutes > 0),
  -- Must be even so both people pay exactly half. Enforced here and in validation.
  total_price_cents  INTEGER NOT NULL CHECK (total_price_cents > 0 AND total_price_cents % 2 = 0),
  indoor             INTEGER NOT NULL DEFAULT 1,
  dress_code         TEXT NOT NULL DEFAULT '',
  arrival_notes      TEXT NOT NULL DEFAULT '',
  cancellation_hours INTEGER NOT NULL DEFAULT 24 CHECK (cancellation_hours BETWEEN 1 AND 168),
  default_hours      TEXT NOT NULL DEFAULT '[]', -- JSON [{dow, time}] used to generate demo inventory
  is_demo            INTEGER NOT NULL DEFAULT 1,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS experiences_category_idx ON date_experiences(category, active);

CREATE TABLE IF NOT EXISTS availability_slots (
  id             TEXT PRIMARY KEY,
  experience_id  TEXT NOT NULL REFERENCES date_experiences(id) ON DELETE CASCADE,
  starts_at      TEXT NOT NULL,
  capacity       INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 0), -- number of two-person dates
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (experience_id, starts_at),
  CHECK (reserved_count <= capacity)
);
CREATE INDEX IF NOT EXISTS slots_discovery_idx ON availability_slots(status, starts_at);

CREATE TABLE IF NOT EXISTS date_invitations (
  id               TEXT PRIMARY KEY,
  slot_id          TEXT NOT NULL REFERENCES availability_slots(id),
  from_user_id     TEXT NOT NULL REFERENCES users(id),
  to_user_id       TEXT NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'withdrawn', 'cancelled')),
  is_repeat        INTEGER NOT NULL DEFAULT 0,
  previous_match_id TEXT,
  expires_at       TEXT NOT NULL,
  responded_at     TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (from_user_id <> to_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_one_pending_per_pair_slot
  ON date_invitations(slot_id, from_user_id, to_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS invitations_to_idx ON date_invitations(to_user_id, status);
CREATE INDEX IF NOT EXISTS invitations_from_idx ON date_invitations(from_user_id, status);

CREATE TABLE IF NOT EXISTS matches (
  id                     TEXT PRIMARY KEY,
  invitation_id          TEXT NOT NULL UNIQUE REFERENCES date_invitations(id),
  slot_id                TEXT NOT NULL REFERENCES availability_slots(id),
  experience_id          TEXT NOT NULL REFERENCES date_experiences(id),
  status                 TEXT NOT NULL CHECK (status IN ('awaiting_commitment', 'confirmed', 'completed', 'cancelled', 'expired')),
  terms_hash             TEXT NOT NULL,
  total_price_cents      INTEGER NOT NULL,
  share_cents            INTEGER NOT NULL,
  fee_cents              INTEGER NOT NULL, -- per participant
  late_refund_pct        INTEGER NOT NULL,   -- policy in force when the match was made
  cancellation_deadline  TEXT NOT NULL,
  commitment_expires_at  TEXT NOT NULL,
  confirmed_at           TEXT,
  cancelled_at           TEXT,
  cancelled_by           TEXT REFERENCES users(id),
  cancel_reason          TEXT,
  completed_at           TEXT,
  finalizing_at          TEXT, -- claim marker so concurrent webhooks finalize a date once
  is_test                INTEGER NOT NULL DEFAULT 1,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  CHECK (share_cents * 2 = total_price_cents)
);
CREATE INDEX IF NOT EXISTS matches_status_idx ON matches(status);

CREATE TABLE IF NOT EXISTS match_participants (
  match_id               TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id                TEXT NOT NULL REFERENCES users(id),
  role                   TEXT NOT NULL CHECK (role IN ('inviter', 'invitee')),
  details_confirmed_hash TEXT,
  details_confirmed_at   TEXT,
  attendance_confirmed_at TEXT,
  PRIMARY KEY (match_id, user_id),
  UNIQUE (match_id, role)
);
CREATE INDEX IF NOT EXISTS participants_user_idx ON match_participants(user_id);

-- A match has exactly two participants; the (match_id, role) uniqueness plus
-- this trigger make a third impossible.
CREATE TRIGGER IF NOT EXISTS match_participants_max_two
BEFORE INSERT ON match_participants
WHEN (SELECT COUNT(*) FROM match_participants WHERE match_id = NEW.match_id) >= 2
BEGIN
  SELECT RAISE(ABORT, 'a match has exactly two participants');
END;

CREATE TABLE IF NOT EXISTS payment_intents (
  id                       TEXT PRIMARY KEY,
  match_id                 TEXT NOT NULL REFERENCES matches(id),
  user_id                  TEXT NOT NULL REFERENCES users(id),
  provider                 TEXT NOT NULL,
  provider_ref             TEXT UNIQUE,
  amount_cents             INTEGER NOT NULL CHECK (amount_cents > 0),
  share_cents              INTEGER NOT NULL,
  fee_cents                INTEGER NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'usd',
  status                   TEXT NOT NULL CHECK (status IN ('processing', 'authorized', 'captured', 'failed', 'canceled', 'refunded', 'partially_refunded')),
  idempotency_key          TEXT NOT NULL UNIQUE,
  failure_reason           TEXT,
  refunded_cents           INTEGER NOT NULL DEFAULT 0,
  authorization_expires_at TEXT,
  is_test                  INTEGER NOT NULL DEFAULT 1,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  CHECK (amount_cents = share_cents + fee_cents),
  CHECK (refunded_cents <= amount_cents)
);
-- One live payment per participant per match: the database refuses a second charge.
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_one_live
  ON payment_intents(match_id, user_id) WHERE status IN ('processing', 'authorized', 'captured', 'refunded', 'partially_refunded');

-- Append-only ledger of money movements, keyed by the provider event that proved them.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  kind              TEXT NOT NULL CHECK (kind IN ('authorization', 'capture', 'void', 'refund', 'failure')),
  amount_cents      INTEGER NOT NULL,
  provider_event_id TEXT NOT NULL UNIQUE,
  is_test           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL
);

-- Webhook idempotency: each verified provider event is processed once.
CREATE TABLE IF NOT EXISTS provider_events (
  id           TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS reservations (
  id                TEXT PRIMARY KEY,
  match_id          TEXT NOT NULL UNIQUE REFERENCES matches(id),
  slot_id           TEXT NOT NULL REFERENCES availability_slots(id),
  status            TEXT NOT NULL CHECK (status IN ('held', 'secured', 'released', 'cancelled')),
  provider          TEXT NOT NULL,
  provider_ref      TEXT,
  confirmation_code TEXT,
  hold_expires_at   TEXT,
  is_test           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reschedule_requests (
  id           TEXT PRIMARY KEY,
  match_id     TEXT NOT NULL REFERENCES matches(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  new_slot_id  TEXT NOT NULL REFERENCES availability_slots(id),
  status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  created_at   TEXT NOT NULL,
  responded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS reschedule_one_pending ON reschedule_requests(match_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS attendance_confirmations (
  match_id       TEXT NOT NULL REFERENCES matches(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  attended       INTEGER NOT NULL,
  other_attended INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_date_feedback (
  match_id          TEXT NOT NULL REFERENCES matches(id),
  user_id           TEXT NOT NULL REFERENCES users(id),
  felt_safe         INTEGER NOT NULL,
  open_to_another   INTEGER NOT NULL,
  experience_rating INTEGER CHECK (experience_rating BETWEEN 1 AND 5),
  venue_rating      INTEGER CHECK (venue_rating BETWEEN 1 AND 5),
  comment           TEXT,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id               TEXT PRIMARY KEY,
  reporter_id      TEXT NOT NULL REFERENCES users(id),
  reported_user_id TEXT REFERENCES users(id),
  match_id         TEXT REFERENCES matches(id),
  kind             TEXT NOT NULL CHECK (kind IN ('harassment', 'misconduct', 'safety', 'fake_profile', 'no_show', 'emergency', 'support', 'other')),
  details          TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'upheld', 'dismissed', 'resolved')),
  resolution_note  TEXT,
  resolved_by      TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports(reported_user_id, kind, status);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT,
  dedupe_key TEXT UNIQUE,
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at);

-- Demo email outbox. A real provider (Resend, Postmark, SES) replaces this in Phase 2.
CREATE TABLE IF NOT EXISTS outbound_emails (
  id         TEXT PRIMARY KEY,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_roles (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'support')),
  granted_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at);

CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- The mock payment provider's own ledger: stands in for Stripe's side of the world.
CREATE TABLE IF NOT EXISTS mock_provider_charges (
  ref             TEXT PRIMARY KEY,
  amount_cents    INTEGER NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('requires_confirmation', 'processing', 'authorized', 'captured', 'failed', 'canceled')),
  refunded_cents  INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mock_provider_requests (
  idempotency_key TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL
);
